import QRCode from "qrcode"

export async function qrPngForUrl(url: string): Promise<Uint8Array> {
  return QRCode.toBuffer(url, {
    type: "png",
    margin: 1,
    width: 220,
    color: { dark: "#052e2b", light: "#ffffff" },
  })
}
