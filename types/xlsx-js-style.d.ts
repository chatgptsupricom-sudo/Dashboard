// xlsx-js-style trae sus tipos en types/index.d.ts pero su package.json no
// los declara, así que TypeScript no los encuentra. Es la misma API de SheetJS
// (paquete `xlsx`) con soporte de estilos: se reusan esos tipos.
declare module "xlsx-js-style" {
  export * from "xlsx";
  const XLSX: typeof import("xlsx");
  export default XLSX;
}
