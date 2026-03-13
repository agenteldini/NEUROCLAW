"use client";

export default function Divider() {
  return (
    <div className="flex justify-center py-8">
      <div
        className="w-full max-w-[280px] h-px"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
