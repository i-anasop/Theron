/**
 * The env_params trap, drawn.
 *
 * Both curves are real captures from the same Phoenix day. The left is what
 * the endpoint returns when you hand it a single scalar temperature and ask
 * for a whole day; the right is the same day computed correctly from per-hour
 * temperature and per-hour humidity.
 *
 * The failure is only obvious as a shape. Described in prose it sounds like a
 * rounding quibble; drawn, the left curve is visibly upside down — coolest in
 * the afternoon, hottest before dawn — and no one needs the argument explained.
 */

/* Returned by env_params with filter_type 3 and temperature=40.31 (°F). */
const BROKEN = [
  167.4, 158.4, 152.6, 165.4, 171.7, 148.1, 148.1, 145.6, 133.3, 122.9, 115.3, 113.2,
  113.7, 112.5, 109.2, 107.4, 106.7, 105.8, 107.2, 111.9, 113.5, 115.3, 122.9, 116.1,
];

/* The same day, computed locally from real hourly temperature + humidity (°F). */
const CORRECT = [
  97.2, 95.9, 93.6, 91.6, 92.4, 103.6, 105.2, 106.4, 106.5, 104.5, 102.7, 106.1,
  106.7, 105.7, 104.7, 104.0, 105.4, 104.4, 102.6, 100.5, 97.7, 97.5, 96.3, 96.6,
];

const W = 240;
const H = 120;
const Y_MIN = 85;
const Y_MAX = 175;

function path(vals: number[]) {
  return vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((Math.min(Y_MAX, Math.max(Y_MIN, v)) - Y_MIN) / (Y_MAX - Y_MIN)) * H;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Panel({
  vals,
  stroke,
  title,
  note,
  bad,
}: {
  vals: number[];
  stroke: string;
  title: string;
  note: string;
  bad?: boolean;
}) {
  const peakHour = vals.indexOf(Math.max(...vals));
  const minHour = vals.indexOf(Math.min(...vals));

  return (
    <div className={`curve ${bad ? "curve-bad" : "curve-good"}`}>
      <div className="curve-head">
        <span className="label">{title}</span>
        <span className={`tag ${bad ? "stand_down" : "keep"}`}>{bad ? "impossible" : "correct"}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path
          d={`${path(vals)} L${W},${H} L0,${H} Z`}
          fill={stroke}
          opacity="0.1"
        />
        <path
          d={path(vals)}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="curve-axis">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>

      <p className="curve-note">
        <b>
          Peak at {String(peakHour).padStart(2, "0")}:00 · low at {String(minHour).padStart(2, "0")}:00
        </b>
        <br />
        {note}
      </p>
    </div>
  );
}

export default function CurveCompare() {
  return (
    <div className="curve-pair">
      <Panel
        vals={BROKEN}
        stroke="var(--extreme)"
        title="What the endpoint returned"
        bad
        note="Hottest before dawn, coolest at teatime. A 167 °F heat index at midnight in Phoenix. The response is well-formed and nothing errors."
      />
      <Panel
        vals={CORRECT}
        stroke="var(--cobalt)"
        title="The same day, computed correctly"
        note="Per-hour temperature paired with per-hour humidity, heat index via NWS Rothfusz. Peak mid-afternoon, low before dawn, as physics requires."
      />
    </div>
  );
}
