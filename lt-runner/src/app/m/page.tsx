import { redirect } from 'next/navigation';

export default function MihalisRedirect() {
  redirect('/?utm_source=mihalis&utm_medium=email');
}
