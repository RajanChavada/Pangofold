import { BedDouble, MapPin, ExternalLink } from "lucide-react";

interface HotelCardProps {
  name: string;
  address?: string;
  link?: string;
}

export function HotelCard({ name, address, link }: HotelCardProps) {
  return (
    <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
          <BedDouble className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Stay</p>
              <h4 className="font-semibold text-[15px] leading-snug">{name}</h4>
            </div>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl hover:bg-emerald-100 transition-colors shrink-0"
              >
                <ExternalLink className="w-4 h-4 text-emerald-600" />
              </a>
            )}
          </div>
          {address && (
            <span className="flex items-center gap-1 text-xs text-text-muted mt-1.5">
              <MapPin className="w-3 h-3" />
              {address}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
