import { cn } from "@/lib/cn";

/** Wordmark "use hitzz" vetorizado do site da marca; herda a cor do texto. */
export function Wordmark({ className, title = "use hitzz" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="345 370 2695 955" className={cn("h-5 w-auto", className)} role="img" aria-label={title} fill="currentColor">
      <path d="m2491.63 1308.61 296.43-509.91c4.04-6.950 6.530-9.910 4.120-17.370-5.140-16.060-23.320-13.140-36.860-13.140h-243.580l4.280-107.470h504.330l-300.940 517.960c-3.960 7.260-9.060 25.130 4.100 25.130h303.530v104.860l-535.410-.06zM886.090 1309.280l-1.980-240.920c-.610-74.120-.520-189.780-21.550-261.060-51.940-176.100-257.480-180-369.570-97.740l-4.640-316.650-128.210 45.640-.520 865.790h132.230v-292.720c0-107.150-15.590-239.070 136.430-240.770 139.600-1.550 129.530 123.350 129.530 221.250l1.800 317.180h126.480zM1079.050 1310.500h124.720V647.580l-124.410 71.840zM1729.830 662.460H1617.400V531.100h-84.620l-155.310 171.540v65.490h103.150l-.360 539.020h134.480V766.140h115.090zM1860.850 1308.610l296.430-509.910c4.050-6.950 6.530-9.910 4.130-17.370-5.140-16.060-23.320-13.140-36.860-13.140h-243.580l4.280-107.470h504.330l-300.950 517.960c-3.960 7.260-9.050 25.130 4.110 25.130h303.530v104.860l-535.420-.06z" />
      <circle cx="1140.37" cy="456.04" r="73.21" />
      <text x="560" y="598" fontFamily="Arial, Helvetica, sans-serif" fontWeight={700} fontSize="218.63">
        use
      </text>
    </svg>
  );
}

/** A onça da marca (desenho original vetorizado). Usa máscara para herdar a cor do texto. */
export function Onca({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block aspect-[828/907] bg-current", className)}
      style={{ mask: "url(/brand/onca.svg) center / contain no-repeat", WebkitMask: "url(/brand/onca.svg) center / contain no-repeat" }}
    />
  );
}

/** Pinta em forma de coração, como as da onça. */
export function HeartSpot({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 22" aria-hidden className={cn("inline-block", className)} style={style} fill="currentColor">
      <path d="M12 21.2c-.5-.4-8.6-5.7-10.6-10.7C-.2 6.4 2.2 1.6 6.6 1.3c2.4-.2 4.2 1 5.4 3 1.3-2.1 3.2-3.3 5.7-3 4.4.4 6.5 5.2 4.9 9.2-2 5-10.1 10.3-10.6 10.7z" />
    </svg>
  );
}
