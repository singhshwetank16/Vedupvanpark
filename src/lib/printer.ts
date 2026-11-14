import type { Ticket, Pass, AppConfig } from '../types';

export class ThermalPrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  isBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connectBluetooth(): Promise<string> {
    if (!this.isBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported on this browser. Use Chrome on Android or Desktop.');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          0xffe0,
          0x18f0,
        ],
      });

      this.bluetoothDevice = device;
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Could not establish GATT connection');

      const services = await server.getPrimaryServices();
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            break;
          }
        }
        if (this.characteristic) break;
      }

      if (!this.characteristic) {
        throw new Error('Connected to Bluetooth device, but no printable ESC/POS channel found.');
      }

      return device.name || 'Bluetooth 3-Inch Thermal Printer';
    } catch (err: unknown) {
      console.error('Bluetooth connection failed:', err);
      throw err;
    }
  }

  disconnectBluetooth() {
    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }
    this.bluetoothDevice = null;
    this.characteristic = null;
  }

  get isConnected(): boolean {
    return !!(this.bluetoothDevice && this.bluetoothDevice.gatt?.connected && this.characteristic);
  }

  // Generate 76.20mm (3-Inch) ESC/POS Commands
  buildEscPosSlip(doc: Ticket | Pass, config: AppConfig): Uint8Array {
    const encoder = new TextEncoder();
    const commands: number[] = [];

    const ESC = 0x1b;
    const GS = 0x1d;

    // Reset & Init
    commands.push(ESC, 0x40);

    // Center alignment
    commands.push(ESC, 0x61, 0x01);

    // Bold & Double Height Header
    commands.push(ESC, 0x21, 0x30);
    commands.push(...encoder.encode(config.park_settings.park_name + '\n'));

    // Normal Text
    commands.push(ESC, 0x21, 0x00);
    commands.push(...encoder.encode(config.park_settings.organization_name + '\n'));
    commands.push(...encoder.encode(config.park_settings.address + '\n'));
    commands.push(...encoder.encode('================================================\n'));

    const isTicket = 'ticket_number' in doc;
    const docNumber = isTicket ? doc.ticket_number : doc.pass_number;
    const qrPayload = doc.qr_raw_token || docNumber;
    const amountInr = isTicket ? (doc.price_paise / 100).toFixed(2) : ((doc.amount_paise || 0) / 100).toFixed(2);
    const persons = isTicket ? doc.persons_count : doc.people_allowed;

    // Banner
    commands.push(ESC, 0x45, 0x01); // Bold ON
    if (isTicket) {
      commands.push(...encoder.encode('*** SINGLE ENTRY TICKET ***\n'));
    } else {
      const passTitle = doc.pass_type === 'YEARLY' ? 'YEARLY PASS' : doc.pass_type === 'FAMILY' ? 'FAMILY PASS' : 'MONTHLY PASS';
      commands.push(...encoder.encode(`*** ${passTitle} ***\n`));
    }
    commands.push(ESC, 0x45, 0x00); // Bold OFF

    // Left Align Details
    commands.push(ESC, 0x61, 0x00);
    commands.push(...encoder.encode(`DOC NO    : ${docNumber}\n`));
    commands.push(...encoder.encode(`DATE & TIME: ${new Date(doc.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`));
    commands.push(...encoder.encode(`COUNTER   : ${config.counter_name} (${config.operator_name})\n`));

    if (!isTicket) {
      commands.push(...encoder.encode(`HOLDER    : ${doc.holder_name}\n`));
      if (doc.holder_phone) {
        commands.push(...encoder.encode(`PHONE     : ${doc.holder_phone}\n`));
      }
      commands.push(...encoder.encode(`VALIDITY  : ${doc.valid_from} TO ${doc.valid_through}\n`));
    }

    commands.push(...encoder.encode('------------------------------------------------\n'));
    commands.push(...encoder.encode(`PERSONS   : ${persons} Person(s) Allowed\n`));
    commands.push(...encoder.encode(`AMOUNT    : Rs. ${amountInr} (PAID)\n`));
    commands.push(...encoder.encode('------------------------------------------------\n'));

    // Center Align for QR
    commands.push(ESC, 0x61, 0x01);

    // ESC/POS QR Code Model 2
    const qrData = encoder.encode(qrPayload);
    const storeLen = qrData.length + 3;
    const pL = storeLen % 256;
    const pH = Math.floor(storeLen / 256);

    commands.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06); // Size 6 for 3-inch
    commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    commands.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    commands.push(...qrData);
    commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // Print QR

    commands.push(...encoder.encode('\n'));
    if (isTicket) {
      commands.push(...encoder.encode('* TICKET EXPIRES IMMEDIATELY UPON GATE SCAN *\n'));
    } else {
      commands.push(...encoder.encode('* PASS VALID FOR DAILY ENTRY WITH COOLDOWN *\n'));
    }
    commands.push(...encoder.encode('Please keep this slip safe until exit.\n'));
    commands.push(...encoder.encode('================================================\n'));
    commands.push(...encoder.encode('Thank You! Have A Pleasant Visit.\n\n\n\n'));

    // Auto-cut
    commands.push(GS, 0x56, 0x42, 0x00);

    return new Uint8Array(commands);
  }

  async printViaBluetooth(doc: Ticket | Pass, config: AppConfig): Promise<void> {
    if (!this.isConnected || !this.characteristic) {
      throw new Error('Bluetooth printer is not connected. Connect from settings first.');
    }

    const data = this.buildEscPosSlip(doc, config);
    const chunkSize = 512;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 20));
    }
  }

  printViaBrowser() {
    window.print();
  }
}

export const printerService = new ThermalPrinterService();
