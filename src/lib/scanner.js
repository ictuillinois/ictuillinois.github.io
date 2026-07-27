// Mobile barcode scanning not available in ICT-Lab (web only)
export const isNative = () => false
export const scanBarcode = async () => { throw new Error('Barcode scanning not supported on web') }
