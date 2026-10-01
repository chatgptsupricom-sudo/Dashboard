// ============================================================
// PLAN DE CONTENIDO — FRECUENCIA CPM
// Tipos TypeScript para el módulo de planificación
// ============================================================

export type CPMType = 'categoria' | 'producto' | 'marca' | 'empresa';
export type ContentFormat = 'supri' | 'persona' | 'carrusel' | 'post';
export type PlanStatus = 'borrador' | 'activo' | 'cerrado';

export interface OdooProduct {
  id: number;
  sku: string;
  name: string;
  brand: string;
  stock: number;
  price: number;
  category?: string;
}

export interface CPMProduct {
  id?: number;
  odooProductId?: number;
  sku: string;
  productName: string;
  brand: string;
  stock: number;
  price: number;
  included: boolean;
}

export interface CPM {
  id?: number;
  planId?: number;
  name: string;
  type: CPMType;
  stockTotal: number;
  supriCount: number;
  personaCount: number;
  carruselCount: number;
  postCount: number;
  sortOrder: number;
  products?: CPMProduct[];
}

export interface SavedContent {
  id?: number;
  planId?: number;
  name: string;
  format: ContentFormat;
  publishDate: string;
  justification: string;
}

export interface CalendarPiece {
  id?: number;
  planId?: number;
  pieceNumber: number;
  dateKey: string;
  cpmId?: number;
  cpmName: string;
  format: ContentFormat;
  topic: string;
  isSaved: boolean;
  savedContentId?: number;
}

export interface CPMPlan {
  id?: number;
  year: number;
  month: number;
  status: PlanStatus;
  createdBy?: number;
  createdAt?: string;
  updatedAt?: string;
  cpms?: CPM[];
  savedContent?: SavedContent[];
  calendar?: CalendarPiece[];
}

// API Request/Response types
export interface OdooProductsRequest {
  tipo: 'marca' | 'categoria' | 'producto';
  valor: string;
  sede?: number;
}

export interface OdooProductsResponse {
  products: OdooProduct[];
  totalStock: number;
  count: number;
}

export interface CreatePlanRequest {
  year: number;
  month: number;
  cpms: Omit<CPM, 'id' | 'planId'>[];
  savedContent?: Omit<SavedContent, 'id' | 'planId'>[];
  calendar?: Omit<CalendarPiece, 'id' | 'planId'>[];
}

export interface ExportInventoryRequest {
  planId: number;
}

export interface ExportCalendarRequest {
  planId: number;
}
