"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValue, useTransform, animate, useInView } from "framer-motion";

interface CountUpNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}

export default function CountUpNumber({
  value,
  duration = 0.8,
  prefix = "",
  suffix = "",
}: CountUpNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Trigger once when the element is in view
  const isInView = useInView(ref, { once: true, margin: "0px 0px -50px 0px" });
  
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(0);
  
  const animatedOnceRef = useRef(false);

  useEffect(() => {
    if (isInView && !animatedOnceRef.current) {
      animatedOnceRef.current = true;
      const controls = animate(count, value, {
        duration: duration,
        ease: "easeOut",
      });
      return () => controls.stop();
    } else if (animatedOnceRef.current) {
      // If already animated once, and the target value changes,
      // animate to the new value from the current display value.
      const controls = animate(count, value, {
        duration: duration * 0.5,
        ease: "easeOut",
      });
      return () => controls.stop();
    }
  }, [isInView, value, duration, count]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (latest) => {
      setDisplayValue(latest);
    });
    return () => unsubscribe();
  }, [rounded]);

  return (
    <span ref={ref}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}
