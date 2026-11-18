import Image from "next/image";
import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <Image src="/arca-logo.webp" alt="" width={120} height={68} className="mx-auto mb-6 h-auto w-24 opacity-80" />
      <p className="text-sm font-semibold text-arca-medio">Erro 404</p>
      <h1 className="mt-1 text-2xl font-bold text-arca-marinho">Página não encontrada</h1>
      <p className="mt-2 text-slate-600">O endereço pode ter mudado ou o chamado não existe.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-arca-azul px-5 py-3 font-semibold text-white">
        Voltar ao início
      </Link>
    </div>
  );
}
