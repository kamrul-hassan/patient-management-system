import { authenticated, isDemo } from "@/lib/session";
import Workspace from "@/components/workspace";
import Login from "@/components/login";

export const dynamic = "force-dynamic";
export default async function Home() {
  return (await authenticated()) ? <Workspace demo={isDemo()} /> : <Login />;
}
