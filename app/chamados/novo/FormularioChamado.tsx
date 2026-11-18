"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { criarChamado, type EstadoNovoChamado } from "../actions";

type Bairro = { id: number; nome: string; regiao: string; lat: number; lng: number };

const TIPOS = [
  { valor: "bueiro_obstruido", rotulo: "Bueiro entupido", emoji: "🕳️" },
  { valor: "lixo_acumulado", rotulo: "Lixo acumulado", emoji: "🗑️" },
  { valor: "corrego_assoreado", rotulo: "Córrego com terra", emoji: "🏞️" },
  { valor: "alagamento_ativo", rotulo: "Alagando agora", emoji: "🌊" },
  { valor: "outro", rotulo: "Outro", emoji: "❓" },
];

/** Reduz a foto no próprio celular (máx. 1280 px, JPEG): envio rápido mesmo com 3G */
async function comprimirFoto(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Falha ao processar a foto"))), "image/jpeg", 0.82),
  );
}

function bairroMaisProximo(bairros: Bairro[], lat: number, lng: number) {
  return bairros.reduce((melhor, b) =>
    Math.hypot(b.lat - lat, b.lng - lng) < Math.hypot(melhor.lat - lat, melhor.lng - lng) ? b : melhor,
  );
}

export function FormularioChamado({
  usuarioId,
  bairros,
  bairroPadrao,
}: {
  usuarioId: string;
  bairros: Bairro[];
  bairroPadrao: number | null;
}) {
  const [estado, acao, enviando] = useActionState<EstadoNovoChamado, FormData>(criarChamado, null);
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [tipo, setTipo] = useState("");
  const [bairroId, setBairroId] = useState(bairroPadrao ? String(bairroPadrao) : "");
  const [local, setLocal] = useState<{ lat: number; lng: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);

  const ocupado = enviando || etapa !== null;

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    setAviso(null);
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return setAviso("Envie um arquivo de imagem.");
    if (arquivo.size > 15 * 1024 * 1024) return setAviso("Foto muito grande (máximo 15 MB).");
    setFoto(arquivo);
    setPrevia(URL.createObjectURL(arquivo));
  }

  function usarLocalizacao() {
    if (!navigator.geolocation) return setAviso("Seu aparelho não permite localização.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ponto = { lat: coords.latitude, lng: coords.longitude };
        setLocal(ponto);
        setBairroId(String(bairroMaisProximo(bairros, ponto.lat, ponto.lng).id));
      },
      () => setAviso("Não foi possível obter a localização. Escolha o bairro na lista."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    const dados = new FormData(e.currentTarget);

    if (foto) {
      try {
        setEtapa("Enviando a foto...");
        const blob = await comprimirFoto(foto);
        const caminho = `${usuarioId}/${crypto.randomUUID()}.jpg`;
        const { error } = await createClient()
          .storage.from("fotos-chamados")
          .upload(caminho, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        dados.set("foto_path", caminho);
      } catch {
        setEtapa(null);
        return setAviso("Não foi possível enviar a foto. Verifique a conexão e tente de novo.");
      }
    }

    setEtapa(null);
    startTransition(() => acao(dados));
  }

  const erro = aviso ?? estado?.erro;

  return (
    <form onSubmit={enviar} className="space-y-5">
      {/* 1. Foto */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">1. Foto do problema</h2>
        <input
          ref={entradaFoto}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={escolherFoto}
          className="hidden"
        />
        {previa ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previa} alt="Prévia da foto" className="h-56 w-full rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => entradaFoto.current?.click()}
              className="absolute right-2 bottom-2 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium shadow"
            >
              Trocar foto
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => entradaFoto.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-arca-claro bg-arca-nevoa text-arca-azul"
          >
            <span className="text-3xl">📷</span>
            <span className="font-semibold">Tirar ou escolher foto</span>
            <span className="text-xs text-slate-500">Recomendado: a IA analisa a imagem</span>
          </button>
        )}
      </section>

      {/* 2. Tipo */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">2. O que você viu?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <label
              key={t.valor}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
                tipo === t.valor ? "border-arca-medio bg-arca-nevoa text-arca-marinho ring-2 ring-arca-claro/60" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="tipo"
                value={t.valor}
                required
                checked={tipo === t.valor}
                onChange={() => setTipo(t.valor)}
                className="sr-only"
              />
              <span className="text-xl" aria-hidden="true">{t.emoji}</span>
              {t.rotulo}
            </label>
          ))}
        </div>
      </section>

      {/* 3. Detalhes */}
      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">3. Onde e como está?</h2>

        <div className="flex gap-2">
          <select
            name="bairro_id"
            required
            value={bairroId}
            onChange={(e) => setBairroId(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
            aria-label="Bairro"
          >
            <option value="" disabled>Escolha o bairro</option>
            {bairros.map((b) => (
              <option key={b.id} value={b.id}>{b.nome} (zona {b.regiao})</option>
            ))}
          </select>
          <button
            type="button"
            onClick={usarLocalizacao}
            className="rounded-xl border border-arca-claro px-3 text-sm font-semibold text-arca-azul"
            title="Usar minha localização"
          >
            📍 {local ? "OK" : "GPS"}
          </button>
        </div>
        {local && <input type="hidden" name="lat" value={local.lat} />}
        {local && <input type="hidden" name="lng" value={local.lng} />}

        <input
          name="referencia"
          maxLength={200}
          placeholder="Ponto de referência (ex.: esquina com a Rua X)"
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
        />
        <textarea
          name="descricao"
          required
          minLength={10}
          maxLength={1000}
          rows={4}
          placeholder="Descreva o problema. Ex.: bueiro tampado por folhas e terra, a água já empoça com pouca chuva."
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
        />
      </section>

      {erro && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}

      <button
        disabled={ocupado}
        className="w-full rounded-xl bg-arca-azul py-4 text-lg font-semibold text-white shadow-lg shadow-arca-azul/20 hover:bg-arca-marinho disabled:opacity-60"
      >
        {etapa ?? (enviando ? "Analisando com IA..." : "Enviar chamado")}
      </button>
      <p className="text-center text-xs text-slate-500">
        Sua foto é usada só para a triagem e fica visível apenas para você e para a equipe de atendimento.
      </p>
    </form>
  );
}
