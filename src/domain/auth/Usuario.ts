import type { PapelUsuario } from "./PapelUsuario";

export interface Usuario {
  id: string;
  login: string;
  nome: string;
  papel: PapelUsuario;
  ativo: boolean;
  criadoEm: string;
}