/**
 * Verdex — a right-aligned user prompt bubble.
 */
interface UserMessageProps {
  prompt: string;
}

export function UserMessage({ prompt }: UserMessageProps) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm leading-relaxed text-on-accent shadow-lg shadow-blue-900/20 whitespace-pre-wrap break-words">
        {prompt}
      </div>
    </div>
  );
}

export default UserMessage;
