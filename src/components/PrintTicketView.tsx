import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Ticket, Pass, AppConfig } from '../types';

interface PrintTicketViewProps {
  document: Ticket | Pass | null;
  config: AppConfig;
}

export const PrintTicketView: React.FC<PrintTicketViewProps> = ({ document: doc, config }) => {
  if (!doc) return null;

  const isTicket = 'ticket_number' in doc;
  const docNumber = isTicket ? doc.ticket_number : doc.pass_number;
  const qrPayload = doc.qr_raw_token || docNumber;
  
  const amountPaise = isTicket ? doc.price_paise : (doc.amount_paise || 0);
  const amountInr = (amountPaise / 100).toFixed(2);
  const personsCount = isTicket ? doc.persons_count : doc.people_allowed;

  const formattedDate = new Date(doc.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const formattedTime = new Date(doc.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  return (
    <div id="print-ticket-root">
      {/* 76.20mm (3-Inch) Thermal Paper Container */}
      <div className="w-[72mm] mx-auto text-black text-center font-mono text-xs leading-tight bg-white">
        {/* Fixed Header */}
        <div className="font-extrabold text-[15px] tracking-wide uppercase border-b-2 border-black pb-1 mb-1 leading-tight">
          {config.park_settings.park_name}
        </div>
        <div className="font-bold text-[11px] mb-0.5">
          {config.park_settings.organization_name}
        </div>
        <div className="text-[10px] text-gray-800 leading-tight mb-2">
          {config.park_settings.address}
        </div>

        {/* Document Type Banner */}
        <div className="border-t border-b border-dashed border-black py-1 my-1.5 font-bold uppercase text-[12px] bg-gray-100">
          {isTicket && 'SINGLE ENTRY TICKET'}
          {!isTicket && doc.pass_type === 'MONTHLY' && 'MONTHLY VISITOR PASS'}
          {!isTicket && doc.pass_type === 'YEARLY' && 'YEARLY VISITOR PASS'}
          {!isTicket && doc.pass_type === 'FAMILY' && 'FAMILY SUBSCRIPTION PASS'}
        </div>

        {/* Dynamic Details */}
        <div className="text-left text-[11px] space-y-0.5 py-1">
          <div className="flex justify-between font-bold">
            <span>DOC NO:</span>
            <span>{docNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>DATE:</span>
            <span>{formattedDate}</span>
          </div>
          <div className="flex justify-between">
            <span>TIME:</span>
            <span>{formattedTime} (IST)</span>
          </div>
          <div className="flex justify-between">
            <span>COUNTER:</span>
            <span>{config.counter_name}</span>
          </div>

          {!isTicket && (
            <>
              <div className="flex justify-between font-bold pt-1">
                <span>HOLDER:</span>
                <span>{doc.holder_name}</span>
              </div>
              {doc.holder_phone && (
                <div className="flex justify-between">
                  <span>PHONE:</span>
                  <span>{doc.holder_phone}</span>
                </div>
              )}
              <div className="flex justify-between text-[10px] text-gray-800">
                <span>VALIDITY:</span>
                <span>{doc.valid_from} TO {doc.valid_through}</span>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-dashed border-black my-1"></div>

        {/* Persons and Pricing */}
        <div className="text-left text-[11px] space-y-0.5 py-1">
          <div className="flex justify-between items-center text-sm font-black">
            <span>PERSONS ALLOWED:</span>
            <span className="text-base border border-black px-1.5 py-0.5 rounded">
              {personsCount} {personsCount > 1 ? 'PERSONS' : 'PERSON'}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm font-black border-t border-dotted border-black pt-1 mt-1">
            <span>TOTAL AMOUNT:</span>
            <span className="text-base">₹{amountInr}</span>
          </div>

          <div className="flex justify-between text-[10px]">
            <span>PAYMENT:</span>
            <span className="font-bold">{doc.payment_method || 'CASH'} (PAID)</span>
          </div>
        </div>

        <div className="border-t border-dashed border-black my-1.5"></div>

        {/* 40mm QR Code */}
        <div className="flex flex-col items-center justify-center my-2">
          <div className="p-1.5 bg-white border-2 border-black rounded inline-block">
            <QRCodeSVG
              value={qrPayload}
              size={135} // ~40mm
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="font-mono font-bold text-[10px] tracking-wider mt-1">
            {docNumber}
          </div>
        </div>

        {/* Expiration Rules Notice */}
        <div className="border-t-2 border-black pt-1 mt-1 text-[9px] text-gray-900 font-bold leading-tight">
          <p className="uppercase text-red-600">⚠ IMPORTANT NOTICE ⚠</p>
          {isTicket ? (
            <>
              <p>* THIS TICKET EXPIRES IMMEDIATELY UPON GATE SCAN *</p>
              <p>* Single Entry Only • Non-Refundable *</p>
            </>
          ) : (
            <>
              <p>* PASS VALID FOR REGULAR ENTRY WITH 60-MIN COOLDOWN *</p>
              <p>* Valid until {doc.valid_through} • Non-Transferable *</p>
            </>
          )}
          <p>Please keep this slip safe until exit.</p>
        </div>

        <div className="border-t border-black my-1"></div>
        <div className="text-[10px] font-bold pb-4">
          Thank you for visiting Ved Upvan Park!
        </div>
      </div>
    </div>
  );
};
