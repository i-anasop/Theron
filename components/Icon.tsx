/**
 * A small inline icon set.
 *
 * Hand-drawn on a 24-unit grid rather than pulled from a library: six icons
 * do not justify a dependency, and these inherit currentColor and stroke
 * width so they sit correctly against the type at any size.
 */

export type IconName =
  | "crew"
  | "wage"
  | "calendar"
  | "gauge"
  | "alert"
  | "receipt"
  | "trend"
  | "shield"
  | "clock"
  | "file";

const PATHS: Record<IconName, React.ReactNode> = {
  crew: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 14.9c1.9.7 3.2 2.6 3.2 5.1" />
    </>
  ),
  wage: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2v9.6" />
      <path d="M14.6 9.6a2.6 2.6 0 0 0-2.6-1.5c-1.5 0-2.6.9-2.6 2.1s1 1.8 2.6 2.1 2.6.9 2.6 2.1-1.1 2.1-2.6 2.1a2.6 2.6 0 0 1-2.6-1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v3M16 3.5v3" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-4.5" />
      <circle cx="12" cy="17" r="1.4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2 2.8 19.5h18.4L12 4.2Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r=".9" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6-2.1-1.6-2.2 1.6v-17Z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  trend: (
    <>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15.5 6.5h5v5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 4.8 6v5.8c0 4.4 3 8 7.2 9.2 4.2-1.2 7.2-4.8 7.2-9.2V6L12 3.2Z" />
      <path d="m9.2 12 2 2 3.6-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7.5L18.5 8v12.5H6V3.5Z" />
      <path d="M13.5 3.5V8h5" />
      <path d="M9 13h6M9 16.5h4" />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
