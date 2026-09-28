export abstract class Validador<T, R = void> {
  abstract validar(valor: T): R;
}