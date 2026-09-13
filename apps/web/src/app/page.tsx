import { redirect } from 'next/navigation';

export default function Index() {
  // The dashboard, not Train: landing on Train assumes you had already decided
  // to train, which is the one thing the first screen should not assume.
  redirect('/home');
}
