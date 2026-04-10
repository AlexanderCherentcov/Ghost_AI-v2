import ChatIdPage from './ChatIdPage';

export function generateStaticParams() {
  return [{ id: 'index' }];
}

export const dynamicParams = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ChatIdPage params={params} />;
}
