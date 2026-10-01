// /**
//  * @license
//  * SPDX-License-Identifier: Apache-2.0
//  */

// export type LeadStatus = string;

// export interface Lead {
//   id: string;
//   nombre: string;
//   nombre_contacto?: string;
//   empresa: string;
//   rif: string;
//   telefono: string;
//   ubicacionEstado: string;
//   ubicacionDetalle: string;
//   canalOrigen: string;
//   campana: string;
//   vendedor: string;
//   sellerId?: string;
//   seller_id?: string;
//   seller_name?: string;
//   estatus: string;
//   whatsapp_link?: string;
//   notas: string;
//   valorEstimado: number;
//   numFactura: string;
//   fechaVenta: string;
//   categoriaInteres: string;
//   fechaIngreso: string;
//   observacionesVendedor?: string;
//   // UI Only / Temporary fields for KanbanBoard
//   hasPassedContactado?: boolean;
//   motivoCierre?: string;
//   rowNumber?: number;
//   hasSecondPurchase?: boolean;
// }

// export interface Column {
//   id: string;
//   title: string;
//   color: string;
//   bgClass: string;
//   borderClass: string;
//   accentClass: string;
//   textClass: string;
// }

// export interface WebhookLog {
//   id: string;
//   timestamp: string;
//   leadId: string;
//   leadNombre: string;
//   prevStatus?: LeadStatus;
//   newStatus: LeadStatus;
//   url: string;
//   status: "PENDING" | "SUCCESS" | "ERROR";
//   responseMessage?: string;
// }
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LeadStatus = string;

export interface Lead {
  id: string;
  nombre: string;
  nombre_contacto?: string;
  empresa: string;
  rif: string;
  telefono: string;
  ubicacionEstado: string;
  ubicacionDetalle: string;
  canalOrigen: string;
  campana: string;
  vendedor: string;
  sellerId?: string;
  seller_id?: string;
  seller_name?: string;
  estatus: string;
  whatsapp_link?: string;
  notas: string;
  valorEstimado: number;
  numFactura: string;
  fechaVenta: string;
  categoriaInteres: string;
  fechaIngreso: string;
  observacionesVendedor?: string;
  identidad?: string;
  // UI Only / Temporary fields for KanbanBoard
  hasPassedContactado?: boolean;
  motivoCierre?: string;
  rowNumber?: number;
  hasSecondPurchase?: boolean;
}

export interface Column {
  id: string;
  title: string;
  color: string;
  bgClass: string;
  borderClass: string;
  accentClass: string;
  textClass: string;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  leadId: string;
  leadNombre: string;
  prevStatus?: LeadStatus;
  newStatus: LeadStatus;
  url: string;
  status: "PENDING" | "SUCCESS" | "ERROR";
  responseMessage?: string;
}
