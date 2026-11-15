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
      {/* 3-Inch / 80mm Full Width Thermal POS Container */}
      <div className="w-full max-w-[76mm] mx-auto text-black text-center font-sans leading-tight bg-white select-none px-1">

        {/* Park Main Header */}
        <div className="font-black text-[20px] tracking-wide uppercase border-b-2 border-black pb-1 mb-1 leading-tight text-black">
          {config.park_settings.park_name}
        </div>
        <div className="font-extrabold text-[12px] uppercase text-black mb-0.5">
          {config.park_settings.organization_name}
        </div>
        <div className="text-[11px] font-semibold text-black leading-snug mb-2">
          {config.park_settings.address}
        </div>

        {/* High-Contrast Document Type Banner */}
        <div className="border-y-2 border-black py-1 my-1.5 font-black uppercase text-[13px] tracking-wider bg-black text-white">
          {isTicket && 'SINGLE ENTRY TICKET'}
          {!isTicket && doc.pass_type === 'MONTHLY' && 'MONTHLY VISITOR PASS'}
          {!isTicket && doc.pass_type === 'YEARLY' && 'YEARLY VISITOR PASS'}
          {!isTicket && doc.pass_type === 'FAMILY' && 'FAMILY SUBSCRIPTION PASS'}
        </div>

        {/* Dynamic Key-Value Details */}
        <div className="text-left text-[12px] space-y-1 py-1 text-black font-semibold">
          <div className="flex justify-between items-center">
            <span className="font-bold">DOC NO:</span>
            <span className="font-mono font-black text-[13px] tracking-wider">{docNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold">DATE:</span>
            <span className="font-black">{formattedDate}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold">TIME:</span>
            <span className="font-black">{formattedTime} (IST)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold">COUNTER:</span>
            <span className="font-black">{config.counter_name}</span>
          </div>

          {!isTicket && (
            <>
              <div className="flex justify-between items-center font-black pt-1 border-t border-black">
                <span>HOLDER:</span>
                <span>{doc.holder_name}</span>
              </div>
              {doc.holder_phone && (
                <div className="flex justify-between items-center">
                  <span>PHONE:</span>
                  <span>{doc.holder_phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[11px] font-bold">
                <span>VALIDITY:</span>
                <span>{doc.valid_from} TO {doc.valid_through}</span>
              </div>
            </>
          )}
        </div>

        <div className="border-t-2 border-black my-1.5"></div>

        {/* Persons Count or Pass Validity Highlights */}
        <div className="text-left text-black py-1">
          {isTicket ? (
            <div className="flex justify-between items-center">
              <span className="text-[14px] font-black uppercase tracking-wide">PERSONS ALLOWED:</span>
              <div className="flex flex-col items-center justify-center border-2 border-black px-3 py-1 rounded bg-white min-w-[75px] text-center">
                <span className="text-[22px] font-black leading-none">{personsCount}</span>
                <span className="text-[11px] font-black tracking-wider leading-none mt-1 uppercase">
                  {personsCount > 1 ? 'PERSONS' : 'PERSON'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-[14px] font-black uppercase tracking-wide">PASS VALIDITY:</span>
              <div className="flex flex-col items-center justify-center border-2 border-black px-3 py-1 rounded bg-white min-w-[125px] text-center">
                <span className="text-[15px] font-black leading-none uppercase">
                  {doc.pass_type === 'YEARLY' ? '365 DAYS (1 YEAR)' : doc.plan_name ? doc.plan_name.toUpperCase() : 'SUBSCRIPTION PASS'}
                </span>
                <span className="text-[10px] font-black tracking-wider leading-none mt-1 uppercase">
                  TILL {doc.valid_through}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center border-t-2 border-black pt-1.5 mt-2">
            <span className="text-[14px] font-black uppercase tracking-wide">TOTAL AMOUNT:</span>
            <span className="text-[22px] font-black tracking-tight">₹{amountInr}</span>
          </div>

          <div className="flex justify-between items-center text-[12px] font-bold pt-0.5">
            <span>PAYMENT:</span>
            <span className="font-black uppercase">{doc.payment_method || 'CASH'} (PAID)</span>
          </div>
        </div>

        <div className="border-t-2 border-black my-2"></div>

        {/* Crisp High-Contrast QR Code */}
        <div className="flex flex-col items-center justify-center my-2">
          <div className="p-2 bg-white border-2 border-black rounded inline-block">
            <QRCodeSVG
              value={qrPayload}
              size={155} // Large, sharp scan
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="font-mono font-black text-[12px] tracking-widest mt-1.5 text-black">
            {docNumber}
          </div>
        </div>

        {/* Rules & Warnings */}
        <div className="border-y-2 border-black py-1.5 my-2 text-[10.5px] text-black font-extrabold leading-normal">
          <p className="uppercase tracking-widest text-[11px] font-black mb-0.5">*** IMPORTANT NOTICE ***</p>
          {isTicket ? (
            <>
              <p>• THIS TICKET EXPIRES IMMEDIATELY UPON GATE SCAN •</p>
              <p>• Single Entry Only • Non-Refundable •</p>
            </>
          ) : (
            <>
              <p>• PASS VALID FOR REGULAR ENTRY WITH 60-MIN COOLDOWN •</p>
              <p>• Valid until {doc.valid_through} • Non-Transferable •</p>
            </>
          )}
          <p className="mt-0.5">Please keep this slip safe until exit.</p>
        </div>

        {/* Receipt Footer in 2 clean lines */}
        <div className="text-[12px] font-black text-black pt-1 pb-6 uppercase tracking-wider text-center leading-tight">
          <div>THANK YOU FOR VISITING</div>
          <div className="mt-1">VED UPVAN PARK!</div>
        </div>
      </div>
    </div>
  );
};
