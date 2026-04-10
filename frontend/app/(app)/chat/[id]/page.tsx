import ChatIdPage from './ChatIdPage';

export function generateStaticParams() {
  return [];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ChatIdPage params={params} />;
}
