/** The full-width primary action of a drawer: Post, Send. Dims instead of hiding when disabled. */
export function Button({ className = "", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`h-[54px] rounded-full bg-ink text-[15px] font-semibold text-paper transition-transform duration-100 active:scale-[0.98] disabled:opacity-35 disabled:active:scale-100 ${className}`}
    />
  );
}
