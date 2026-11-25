export interface SubnetCalculationResult {
  inputIp: string;
  cidr: number;
  subnetMask: string;
  wildcardMask: string;
  networkAddress: string;
  broadcastAddress: string;
  firstUsableHost: string;
  lastUsableHost: string;
  totalAddresses: number;
  usableHosts: number;
  ipClass: 'A' | 'B' | 'C' | 'D (Multicast)' | 'E (Reserved)';
  scope: string;
  binaryIp: string;
  binaryMask: string;
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function ipToUint32(ip: string): number {
  const [a, b, c, d] = ip.trim().split('.').map(Number);
  return (((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d) >>> 0;
}

function uint32ToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join('.');
}

function uint32ToBinary(int: number): string {
  return [
    ((int >>> 24) & 255).toString(2).padStart(8, '0'),
    ((int >>> 16) & 255).toString(2).padStart(8, '0'),
    ((int >>> 8) & 255).toString(2).padStart(8, '0'),
    (int & 255).toString(2).padStart(8, '0'),
  ].join('.');
}

function classifyIp(ipUint: number): { ipClass: SubnetCalculationResult['ipClass']; scope: string } {
  const first = (ipUint >>> 24) & 255;
  const second = (ipUint >>> 16) & 255;

  let ipClass: SubnetCalculationResult['ipClass'] = 'A';
  if (first < 128) ipClass = 'A';
  else if (first < 192) ipClass = 'B';
  else if (first < 224) ipClass = 'C';
  else if (first < 240) ipClass = 'D (Multicast)';
  else ipClass = 'E (Reserved)';

  let scope = 'Public Routable';
  if (first === 10) scope = 'Private (RFC 1918)';
  else if (first === 172 && second >= 16 && second <= 31) scope = 'Private (RFC 1918)';
  else if (first === 192 && second === 168) scope = 'Private (RFC 1918)';
  else if (first === 127) scope = 'Loopback (RFC 1122)';
  else if (first === 169 && second === 254) scope = 'Link-Local / APIPA (RFC 3927)';
  else if (first === 100 && second >= 64 && second <= 127) scope = 'Carrier-Grade NAT (RFC 6598)';
  else if (first >= 224 && first <= 239) scope = 'Multicast';

  return { ipClass, scope };
}

export function calculateSubnet(
  ipInput: string,
  cidrInput: number
): { ok: true; data: SubnetCalculationResult } | { ok: false; error: string } {
  const ip = ipInput.trim();
  if (!isValidIpv4(ip)) {
    return { ok: false, error: 'Enter a valid IPv4 address (e.g., 192.168.10.45).' };
  }
  if (!Number.isInteger(cidrInput) || cidrInput < 0 || cidrInput > 32) {
    return { ok: false, error: 'CIDR prefix length must be an integer between 0 and 32.' };
  }

  const ipInt = ipToUint32(ip);
  const maskInt = cidrInput === 0 ? 0 : (0xffffffff << (32 - cidrInput)) >>> 0;
  const wildcardInt = (~maskInt) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const totalAddresses = Math.pow(2, 32 - cidrInput);

  let usableHosts = 0;
  let firstHostInt = networkInt;
  let lastHostInt = broadcastInt;

  if (cidrInput === 32) {
    usableHosts = 1;
    firstHostInt = networkInt;
    lastHostInt = networkInt;
  } else if (cidrInput === 31) {
    // RFC 3021 point-to-point link
    usableHosts = 2;
    firstHostInt = networkInt;
    lastHostInt = broadcastInt;
  } else {
    usableHosts = Math.max(0, totalAddresses - 2);
    firstHostInt = (networkInt + 1) >>> 0;
    lastHostInt = (broadcastInt - 1) >>> 0;
  }

  const { ipClass, scope } = classifyIp(ipInt);

  return {
    ok: true,
    data: {
      inputIp: ip,
      cidr: cidrInput,
      subnetMask: uint32ToIp(maskInt),
      wildcardMask: uint32ToIp(wildcardInt),
      networkAddress: uint32ToIp(networkInt),
      broadcastAddress: uint32ToIp(broadcastInt),
      firstUsableHost: uint32ToIp(firstHostInt),
      lastUsableHost: uint32ToIp(lastHostInt),
      totalAddresses,
      usableHosts,
      ipClass,
      scope,
      binaryIp: uint32ToBinary(ipInt),
      binaryMask: uint32ToBinary(maskInt),
    },
  };
}
