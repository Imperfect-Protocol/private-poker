export default function Title({
  tableName,
  rightText = null,
}) {
  return (
    <div className="max-w-7xl mx-auto w-full flex justify-between items-start mb-4">
      <div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">{tableName}</h1>
      </div>
      {rightText && (
        <div>
          <p className="text-3xl md:text-4xl font-black tracking-tighter uppercase">{rightText}</p>
        </div>
      )}
    </div>
  );
}
