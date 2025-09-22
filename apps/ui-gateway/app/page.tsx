import Dashboard from './components/Dashboard';

const AGENT_BASE_DEFAULT = 'http://127.0.0.1:4010';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  const baseUrl = process.env.NEXT_PUBLIC_AGENT_BASE_URL ?? AGENT_BASE_DEFAULT;
  return <Dashboard agentBaseUrl={baseUrl} />;
}
