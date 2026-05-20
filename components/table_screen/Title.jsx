export default function Title({
  tableName,
}) {
  return (
    <div className="max-w-7xl mx-auto w-full flex justify-between items-start mb-4">
      <div>
        <h1 className="text-2xl font-black tracking-tighter uppercase">{tableName}</h1>
      </div>
    </div>
  );
}
