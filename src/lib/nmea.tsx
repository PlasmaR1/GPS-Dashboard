// NMEA/类NMEA 坐标转十进制度 convert bike location to lat long from return
export function nmeaCoordToDecimal(value: string, hemi: "N" | "S" | "E" | "W"): number {
  const degDigits = hemi === "E" || hemi === "W" ? 3 : 2; // 经度3位度，纬度2位度 3 lat digit, 2 long digit
  const degrees = parseInt(value.slice(0, degDigits), 10);
  const minutes = parseFloat(value.slice(degDigits));
  const dec = degrees + minutes / 60;
  return hemi === "S" || hemi === "W" ? -dec : dec;
}

// 解析设备返回的 device_response
export function parseDeviceResponse(line: string): { lat: number; lng: number } {
  const trimmed = line.trim().replace(/^[*]/, "").replace(/#$/, "");
  const parts = trimmed.split(",");

  const latVal = parts[7]; // 纬度值 lat
  const latHem = parts[8] as "N" | "S";
  const lngVal = parts[9]; // 经度值 long
  const lngHem = parts[10] as "E" | "W";

  return {
    lat: nmeaCoordToDecimal(latVal, latHem),
    lng: nmeaCoordToDecimal(lngVal, lngHem),
  };
}
