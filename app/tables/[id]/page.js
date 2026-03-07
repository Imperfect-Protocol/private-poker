import TableClient from '@/components/TableClient';

export default async function TablePage({ params }) {
  const { id } = await params;

  const res = await fetch(`http://localhost:3000/table-${id}.json`);
  const tableData = await res.json();

  return <TableClient id={id} tableData={tableData} />;
}