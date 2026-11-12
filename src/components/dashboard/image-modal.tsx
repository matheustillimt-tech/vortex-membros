"use client";

import { Button } from "./button";
import { ImageUpload } from "./image-upload";
import { Modal, ModalFooter } from "./modal";

/** Modal "Editar imagem": envia a imagem e grava a URL no campo `field` junto com `id`. */
export function ImageModal({
  open,
  onClose,
  title,
  id,
  field,
  value,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  id: number | null;
  field: string;
  value: string | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description="JPG, PNG, WebP ou GIF, até 2 MB.">
      {open && id !== null ? (
        <form action={onSubmit} className="space-y-6">
          <input type="hidden" name="id" value={id} />
          <ImageUpload name={field} defaultValue={value} boxClassName="w-44 h-28" />
          <ModalFooter>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </ModalFooter>
        </form>
      ) : null}
    </Modal>
  );
}
