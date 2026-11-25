import { ExternalLink, Printer, ScanQrCode } from 'lucide-react';
import { formatCode, useInfo } from '../lib.jsx';
import { Button, Card } from '../ui.jsx';
import { Poster } from '../qr.jsx';
import { siteAddress } from '../admin/shared.jsx';

// The company's desk QR code: the poster at its desk, which it activated by scanning. Until then
// this is where it does that. Below: how to open this dashboard on another phone.
export default function DeskQr({ company, accessCode, onActivate }) {
  const { info } = useInfo();
  const site = siteAddress(info);
  const activated = Boolean(company.desk_id);
  // A company that the organisers placed at a desk themselves has a QR code of its own.
  const hasQr = activated || Boolean(company.room_no);
  const url = `${site}/c/${company.desk_id || company.id}`;
  const poster = <Poster company={company} url={url} fairName={info.fair_name} />;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start print:hidden">
        <Card className="p-5 sm:p-6">
          {hasQr ? (
            <>
              <h2 className="text-lg font-extrabold text-slate-900">Your desk QR code</h2>
              <p className="mt-0.5 text-[15px] text-slate-600">
                {activated ? `This is the QR code on the poster at your desk (desk ${company.room_no}).` : 'This is the QR code of your company.'} Candidates who scan it see your company and job openings, and apply.
              </p>
              <div className="mx-auto mt-4 max-w-xs">{poster}</div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button size="lg" className="flex-1" onClick={() => window.print()}>
                  <Printer className="size-5" aria-hidden="true" /> Print
                </Button>
                <Button as="a" href={`/c/${company.desk_id || company.id}`} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg" className="flex-1">
                  <ExternalLink className="size-5" aria-hidden="true" /> See what candidates see
                </Button>
              </div>
              <button type="button" onClick={onActivate} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 text-left text-[15px] font-bold text-blue-700 underline-offset-4 hover:underline">
                <ScanQrCode className="size-5 shrink-0" aria-hidden="true" /> {activated ? 'Moved to another desk? Scan the QR code there' : 'Scan the QR code on the poster at your desk'}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-extrabold text-slate-900">Activate your desk</h2>
              <p className="mt-0.5 text-[15px] text-slate-600">
                There is a QR code poster at your interview desk. Scan it here and that desk becomes yours: candidates who scan the poster will see your company and can apply.
              </p>
              <Button size="lg" className="mt-4 w-full" onClick={onActivate}>
                <ScanQrCode className="size-5" aria-hidden="true" /> Scan the QR code at my desk
              </Button>
            </>
          )}
        </Card>

        {accessCode && (
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-extrabold text-slate-900">Use another phone or laptop</h2>
            <p className="mt-0.5 text-[15px] text-slate-600">
              Open <span className="break-all font-bold text-slate-900">{site.replace(/^https?:\/\//, '')}/company</span> and enter this access code. Keep the code within your company.
            </p>
            <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-center text-white">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-300">Access code</p>
              <p className="mt-1 select-all font-mono text-3xl font-bold tracking-[0.15em]">{formatCode(accessCode)}</p>
            </div>
          </Card>
        )}
      </div>

      {/* Only this is printed: the poster, filling an A4 page. */}
      {hasQr && (
        <div className="per-1 solo hidden print:block">
          <div className="poster-slot">{poster}</div>
        </div>
      )}
    </>
  );
}
