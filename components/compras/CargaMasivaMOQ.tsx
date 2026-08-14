"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
// Importa tu toast si lo usas en el proyecto. Si no, puedes cambiar los toast() por alert()
import { useToast } from "@/hooks/use-toast";

export default function CargaMasivaMOQ() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });

        // Lee la primera hoja del documento
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convierte el Excel a un arreglo de objetos JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Mapea la data para encontrar columnas independientemente de mayúsculas/minúsculas
        const moqData = jsonData
          .map((row: any) => {
            const skuKey = Object.keys(row).find(
              (key) =>
                key.toLowerCase() === "sku" || key.toLowerCase() === "codigo",
            );
            const qtyKey = Object.keys(row).find(
              (key) =>
                key.toLowerCase().includes("cantidad") ||
                key.toLowerCase().includes("moq"),
            );

            return {
              sku: skuKey ? String(row[skuKey]).trim() : "",
              cantidad: qtyKey ? Number(row[qtyKey]) : 1,
            };
          })
          .filter(
            (item) =>
              item.sku !== "" && !isNaN(item.cantidad) && item.cantidad > 0,
          );

        if (moqData.length === 0) {
          toast({
            title: "Error de Formato",
            description:
              'El Excel debe contener las columnas "SKU" y "CANTIDAD".',
            variant: "destructive",
          });
          setIsUploading(false);
          return;
        }

        // 3. Enviar la data procesada a nuestra API
        const response = await fetch("/api/compras/moq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moqData }),
        });

        const result = await response.json();

        if (response.ok) {
          toast({
            title: "Carga Exitosa",
            description:
              result.message || `${moqData.length} registros actualizados.`,
            className: "bg-green-50 border-green-200 text-green-800",
          });
        } else {
          toast({
            title: "Error al subir",
            description: result.error,
            variant: "destructive",
          });
        }

        setIsUploading(false);
        // Limpiamos el input para permitir volver a cargar el mismo archivo
        if (fileInputRef.current) fileInputRef.current.value = "";
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      console.error("Error leyendo Excel:", error);
      toast({
        title: "Error",
        description: "No se pudo leer el archivo Excel.",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  return (
    <Card className="shadow-sm border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
          <FileSpreadsheet className="h-5 w-5" />
          Carga Masiva de MOQ
        </CardTitle>
        <CardDescription>
          Sube un archivo Excel (.xlsx) con las columnas <strong>SKU</strong> y{" "}
          <strong>CANTIDAD</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Actualizando
                Base de Datos...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Seleccionar Excel
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
