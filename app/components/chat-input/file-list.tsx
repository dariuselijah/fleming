import { AnimatePresence, motion } from "motion/react"
import { getChatAttachmentFileId } from "@/lib/chat-attachments/constants"
import type { FileUploadStatus } from "@/app/components/chat/use-file-upload"
import { FileItem } from "./file-items"

type FileListProps = {
  files: File[]
  getFileStatus?: (file: File) => FileUploadStatus | undefined
  onFileRemove: (file: File) => void
}

const TRANSITION = {
  type: "spring",
  duration: 0.2,
  bounce: 0,
}

export function FileList({ files, getFileStatus, onFileRemove }: FileListProps) {
  return (
    <AnimatePresence initial={false}>
      {files.length > 0 && (
        <motion.div
          key="files-list"
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0 }}
          transition={TRANSITION}
          className="overflow-hidden"
        >
          <div className="flex flex-row overflow-x-auto pl-3">
            <AnimatePresence initial={false}>
              {files.map((file) => (
                <motion.div
                  key={getChatAttachmentFileId(file)}
                  initial={{ width: 0 }}
                  animate={{ width: 180 }}
                  exit={{ width: 0 }}
                  transition={TRANSITION}
                  className="relative shrink-0 overflow-hidden pt-2"
                >
                  <FileItem
                    file={file}
                    status={getFileStatus?.(file)}
                    onRemove={onFileRemove}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
