import React, { useMemo, useState, useCallback } from 'react';
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  CheckSquare,
  Copy,
  Info,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Square,
  Terminal,
  Wifi,
  WifiOff,
  Globe,
  Server,
  HardDrive,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Maximize2,
} from 'lucide-react';
import { calculateSubnet, type SubnetResult } from '../core/logic/subnet';
import { Button, Field, Input, PageHeader, Select, StatusText, Toast, ToastContainer, type ToastMessage } from '../components/ui/Primitives';
import { toCsv } from '../core/logic/operations';

interface ChecklistStep {
  id: string;
  layer: string;
  title: string;
  detail: string;
  command: string;
  category: 'physical' | 'addressing' | 'gateway' | 'dns' | 'routing' | 'firewall';
}

const DIAGNOSTIC_STEPS: ChecklistStep[] = [
  {
    id: 'phy',
    layer: 'Layer 1 · Physical',
    title: 'Verify physical link lights & cable seating',
    detail: 'Confirm RJ45 link/activity LEDs on NIC and switch port, or check Wi-Fi radio toggle and SSID signal strength.',
    command: 'netsh interface show interface',
    category: 'physical',
  },
  {
    id: 'dhcp',
    layer: 'Layer 2/3 · Addressing',
    title: 'Confirm valid DHCP lease (avoid 169.254.x.x APIPA)',
    detail: 'Ensure the workstation received an IP address, subnet mask, default gateway, and DNS servers on the expected VLAN.',
    command: 'ipconfig /all',
    category: 'addressing',
  },
  {
    id: 'gw',
    layer: 'Layer 3 · Gateway',
    title: 'Test local default gateway reachability',
    detail: 'Ping the subnet default gateway to isolate local LAN/VLAN faults from upstream WAN routing issues.',
    command: 'ping -n 4 <gateway-ip>',
    category: 'gateway',
  },
  {
    id: 'dns',
    layer: 'Layer 7 · DNS',
    title: 'Validate internal and external DNS resolution',
    detail: 'Test resolving an internal hostname and a public FQDN. Flush local resolver cache if stale records persist.',
    command: 'nslookup intranet.local && ipconfig /flushdns',
    category: 'dns',
  },
  {
    id: 'route',
    layer: 'Layer 3 · Routing & WAN',
    title: 'Trace path beyond firewall/router',
    detail: 'Identify where packets drop across ISP gateway hops or site-to-site VPN tunnels.',
    command: 'tracert -d 1.1.1.1',
    category: 'routing',
  },
  {
    id: 'port',
    layer: 'Layer 4 · Firewall & Ports',
    title: 'Verify required TCP service ports & proxy policy',
    detail: 'Check Windows Defender Firewall profile (Domain/Private/Public) and verify outbound TCP 443/53/9100 access.',
    command: 'Test-NetConnection -ComputerName <host> -Port 443',
    category: 'firewall',
  },
];

interface TroubleshootingGuide {
  id: string;
  title: string;
  category: string;
  symptoms: string[];
  checks: string[];
  commands: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
  estimatedTime: string;
}

const NETWORK_GUIDES: TroubleshootingGuide[] = [
  {
    id: 'internet',
    title: 'Internet Connectivity Outage',
    category: 'Internet Connectivity',
    symptoms: ['Browser shows ERR_INTERNET_DISCONNECTED or timeout', 'Local LAN resources still work or fail simultaneously'],
    checks: [
      'Determine scope: single endpoint, single VLAN/floor, or entire office.',
      'Check ISP modem/ONT WAN interface status LEDs and firewall WAN link.',
      'Test ping to default gateway first, then to 1.1.1.1 (raw IP), then to a domain name to separate routing from DNS.',
      'Check if failover cellular/secondary WAN route activated cleanly.',
    ],
    commands: ['ipconfig /all', 'ping 1.1.1.1', 'tracert -d 8.8.8.8'],
    difficulty: 'basic',
    estimatedTime: '5-10 min',
  },
  {
    id: 'dns',
    title: 'DNS Resolution Failures',
    category: 'DNS Issues',
    symptoms: ['Ping by IP succeeds but websites fail with DNS_PROBE_FINISHED_NXDOMAIN', 'Internal hostnames do not resolve over VPN'],
    checks: [
      'Verify primary and secondary DNS servers assigned by DHCP match organization policy.',
      'Flush local OS DNS cache and test direct query against internal DNS forwarder.',
      'Confirm UDP/TCP port 53 is not blocked by endpoint firewall or split-tunnel VPN configuration.',
    ],
    commands: ['ipconfig /flushdns', 'nslookup example.org 1.1.1.1', 'Resolve-DnsName portal.internal'],
    difficulty: 'basic',
    estimatedTime: '5 min',
  },
  {
    id: 'wifi',
    title: 'Wi-Fi Dropouts & Slow Throughput',
    category: 'Wi-Fi Issues',
    symptoms: ['Frequent disconnects when roaming between offices', 'Connected with "No Internet" warning'],
    checks: [
      'Check RSSI signal level (aim for -65 dBm or stronger) and 5 GHz channel overlap.',
      'Verify Access Point PoE power draw and uplink switch negotiation (1 Gbps vs 100 Mbps).',
      'Inspect WLAN report for authentication timeouts or driver crashes.',
    ],
    commands: ['netsh wlan show interfaces', 'netsh wlan show wlanreport'],
    difficulty: 'intermediate',
    estimatedTime: '10-15 min',
  },
  {
    id: 'lan',
    title: 'Wired LAN & Switch Port Faults',
    category: 'LAN Issues',
    symptoms: ['Ethernet shows "Unidentified Network" or "Network cable unplugged"', 'Link negotiates at 100 Mbps instead of 1 Gbps'],
    checks: [
      'Swap patch cord and test wall jack with a known-working laptop or cable tester.',
      'Verify switch port VLAN assignment (access vs trunk) and check for err-disabled/BPDU guard state.',
      'Inspect NIC speed/duplex settings and ensure Auto-Negotiation is enabled.',
    ],
    commands: ['Get-NetAdapter | Format-Table Name,Status,LinkSpeed', 'arp -a'],
    difficulty: 'basic',
    estimatedTime: '5-10 min',
  },
  {
    id: 'dhcp',
    title: 'DHCP Lease Exhaustion & APIPA (169.254.x.x)',
    category: 'DHCP Issues',
    symptoms: ['Client receives 169.254.x.x address', 'New devices cannot join Wi-Fi during peak hours'],
    checks: [
      'Verify DHCP scope utilization on router/server — reclaim expired leases or shorten lease duration for guest VLANs.',
      'Confirm IP Helper / DHCP Relay address is configured on Layer 3 VLAN interfaces.',
      'Check for rogue DHCP servers plugged into access ports.',
    ],
    commands: ['ipconfig /release', 'ipconfig /renew', 'netsh dhcpclient trace enable'],
    difficulty: 'intermediate',
    estimatedTime: '10 min',
  },
  {
    id: 'printer',
    title: 'Network Printer Offline or Stalled Queue',
    category: 'Printer Connectivity',
    symptoms: ['Print jobs stay in Spooling or Error state', 'Printer IP changed after power outage'],
    checks: [
      'Confirm printer has a static IP or DHCP reservation outside the dynamic pool.',
      'Verify Standard TCP/IP Port (Raw 9100) is used rather than unstable WSD port.',
      'Restart Print Spooler service and clear stale files from C:\\Windows\\System32\\spool\\PRINTERS.',
    ],
    commands: ['Test-NetConnection -ComputerName <printer-ip> -Port 9100', 'net stop spooler && net start spooler'],
    difficulty: 'basic',
    estimatedTime: '5 min',
  },
  {
    id: 'windows',
    title: 'Windows Network Stack Reset',
    category: 'Windows Networking',
    symptoms: ['VPN adapter breaks routing table after sleep/hibernate', 'Winsock or TCP/IP corruption after OS update'],
    checks: [
      'Check active default routes (0.0.0.0/0) for duplicate or stale VPN metrics.',
      'Disable/re-enable NIC adapter before performing Winsock reset.',
      'Reset Winsock and TCP/IP stack as Administrator and reboot.',
    ],
    commands: ['route print -4', 'netsh winsock reset', 'netsh int ip reset'],
    difficulty: 'advanced',
    estimatedTime: '5-10 min (requires reboot)',
  },
  {
    id: 'devices',
    title: 'Router, Switch & AP Hardware Triage',
    category: 'Network Devices',
    symptoms: ['Intermittent packet loss across multiple rooms', 'Switch or AP rebooting unexpectedly'],
    checks: [
      'Inspect UPS load, rack ventilation/temperature, and PoE budget utilization.',
      'Review device uptime and interface CRC/input errors on uplink ports.',
      'Verify configuration backup exists before firmware updates or power cycling.',
    ],
    commands: ['ssh admin@<switch-ip>', 'show interfaces status', 'show power inline'],
    difficulty: 'advanced',
    estimatedTime: '15-30 min',
  },
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Internet Connectivity': Globe,
  'DNS Issues': Globe,
  'Wi-Fi Issues': Wifi,
  'LAN Issues': HardDrive,
  'DHCP Issues': Server,
  'Printer Connectivity': HardDrive,
  'Windows Networking': Terminal,
  'Network Devices': Server,
};

const DIFFICULTY_COLORS: Record<string, string> = {
  basic: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  intermediate: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  advanced: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

export function NetworkToolsPage() {
  const [ipInput, setIpInput] = useState('192.168.10.45');
  const [cidrInput, setCidrInput] = useState(24);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [selectedGuideId, setSelectedGuideId] = useState<string>(NETWORK_GUIDES[0].id);
  const [searchGuides, setSearchGuides] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    symptoms: true,
    checks: true,
    commands: true,
  });
  const [showAllCommands, setShowAllCommands] = useState(false);
  const [subnetHistory, setSubnetHistory] = useState<SubnetResult[]>([]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const subnetResult = useMemo(() => calculateSubnet(ipInput, cidrInput), [ipInput, cidrInput]);

  const completedCount = useMemo(
    () => DIAGNOSTIC_STEPS.filter((s) => checkedSteps[s.id]).length,
    [checkedSteps]
  );

  const activeGuide = useMemo(
    () => NETWORK_GUIDES.find((g) => g.id === selectedGuideId) ?? NETWORK_GUIDES[0],
    [selectedGuideId]
  );

  const filteredGuides = useMemo(() => {
    const q = searchGuides.trim().toLowerCase();
    if (!q) return NETWORK_GUIDES;
    return NETWORK_GUIDES.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        g.symptoms.some((s) => s.toLowerCase().includes(q)) ||
        g.checks.some((c) => c.toLowerCase().includes(q))
    );
  }, [searchGuides]);

  const toggleStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetChecklist = () => setCheckedSteps({});

  const exportChecklist = () => {
    const headers = ['Layer', 'Title', 'Detail', 'Command', 'Completed'];
    const rows = DIAGNOSTIC_STEPS.map((s) => [
      s.layer,
      s.title,
      s.detail,
      s.command,
      checkedSteps[s.id] ? 'Yes' : 'No',
    ]);
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixdesk-network-diagnostic-checklist-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Diagnostic checklist exported to CSV');
  };

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    showToast('success', 'Command copied to clipboard');
  };

  const addToHistory = (result: SubnetResult) => {
    if (!result.ok) return;
    setSubnetHistory((prev) => {
      const exists = prev.some(
        (r) => r.data.networkAddress === result.data.networkAddress && r.data.subnetMask === result.data.subnetMask
      );
      if (exists) return prev;
      return [result, ...prev.slice(0, 4)];
    });
  };

  // Add to history when result changes
  React.useEffect(() => {
    if (subnetResult.ok) addToHistory(subnetResult);
  }, [subnetResult.ok, subnetResult.data?.networkAddress, subnetResult.data?.subnetMask]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const CategoryIcon = CATEGORY_ICONS[activeGuide.category] || BookOpen;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Tools & Diagnostics"
        description="Real IPv4 CIDR subnet calculations, structured OSI layer diagnostic checklists, and IT networking runbooks."
        actions={
          <Button variant="secondary" onClick={exportChecklist} aria-label="Export diagnostic checklist to CSV">
            <Download className="w-4 h-4" />
            Export Checklist
          </Button>
        }
      />

      {/* Transparent Web vs Desktop Environment Notice */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            Browser Sandbox & Native Desktop Utility Boundary
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            This web edition runs inside browser security sandboxing, which prevents raw ICMP sockets, ARP table
            inspection, and local NIC MAC enumeration. Rather than simulating fake ping or DNS outputs, live OS-level
            utilities (ICMP Ping, Traceroute, DNS lookup, Port Check, Local Network Interface Info) are architected for
            the Tauri 2 Windows Desktop shell via native Rust/OS commands. The IPv4 Subnet Calculator, diagnostic
            checklist, and copyable Windows CLI commands below work fully offline in the browser.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* IPv4 Subnet Calculator */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                IPv4 CIDR Subnet Calculator
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIpInput('10.20.4.12');
                  setCidrInput(22);
                }}
              >
                10.20.4.12/22
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIpInput('192.168.10.45');
                  setCidrInput(26);
                }}
              >
                192.168.10.45/26
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIpInput('172.16.0.1');
                  setCidrInput(16);
                }}
              >
                172.16.0.1/16
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field
                label="IPv4 Address"
                htmlFor="subnet-ip"
                error={!subnetResult.ok ? subnetResult.error : undefined}
              >
                <Input
                  id="subnet-ip"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="192.168.10.45"
                  className="font-mono"
                />
              </Field>
            </div>
            <div>
              <Field label="CIDR Prefix" htmlFor="subnet-cidr">
                <Select
                  id="subnet-cidr"
                  value={cidrInput}
                  onChange={(e) => setCidrInput(Number(e.target.value))}
                  className="font-mono"
                >
                  {Array.from({ length: 33 }, (_, i) => i).map((prefix) => (
                    <option key={prefix} value={prefix}>
                      /{prefix}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          {subnetResult.ok && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <SubnetInfoCard label="Network Address" value={subnetResult.data.networkAddress} />
                <SubnetInfoCard label="Broadcast Address" value={subnetResult.data.broadcastAddress} />
                <SubnetInfoCard label="Subnet Mask" value={subnetResult.data.subnetMask} />
                <SubnetInfoCard label="Wildcard Mask" value={subnetResult.data.wildcardMask} />
                <SubnetInfoCard label="Usable Hosts" value={subnetResult.data.usableHosts.toLocaleString()} />
                <SubnetInfoCard label="Total Addresses" value={subnetResult.data.totalAddresses.toLocaleString()} />
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Usable Host Range</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {subnetResult.data.firstUsableHost} — {subnetResult.data.lastUsableHost}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Class & Scope</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Class {subnetResult.data.ipClass} · {subnetResult.data.scope}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Binary IP</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {subnetResult.data.binaryIp}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Binary Mask</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {subnetResult.data.binaryMask}
                  </span>
                </div>
              </div>

              {/* History */}
              {subnetHistory.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Recent Calculations
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {subnetHistory.map((h, i) => (
                      <Button
                        key={i}
                        variant="ghost"
                        size="sm"
                        className="font-mono text-xs"
                        onClick={() => {
                          const ip = h.data.firstUsableHost;
                          const cidr = h.data.subnetMask.split('.').reduce((acc, octet) => acc + countBits(octet), 0);
                          setIpInput(ip);
                          setCidrInput(cidr);
                        }}
                      >
                        {h.data.networkAddress}/{cidrFromMask(h.data.subnetMask)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Interactive Connectivity Diagnostic Checklist */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Connectivity Diagnostic Checklist
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                {completedCount} of {DIAGNOSTIC_STEPS.length} layers verified
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={resetChecklist} aria-label="Reset diagnostic checklist">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
              <Button variant="ghost" size="sm" onClick={exportChecklist} aria-label="Export checklist to CSV">
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-2.5">
            {DIAGNOSTIC_STEPS.map((step) => {
              const checked = Boolean(checkedSteps[step.id]);
              const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
                physical: HardDrive,
                addressing: Server,
                gateway: Globe,
                dns: Globe,
                routing: Wifi,
                firewall: AlertTriangle,
              };
              const CatIcon = categoryIcons[step.category] || Square;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    checked
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {step.layer}
                        </p>
                        <CatIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {step.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{step.detail}</p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <p className="text-[11px] font-mono text-sky-700 dark:text-sky-400 flex-1 truncate">
                          {step.command}
                        </p>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyCommand(step.command); }} aria-label="Copy command">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Structured Troubleshooting Guides */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Network Troubleshooting Runbooks
            </h2>
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchGuides}
              onChange={(e) => setSearchGuides(e.target.value)}
              placeholder="Search runbooks by title, symptom, or command..."
              aria-label="Search troubleshooting guides"
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-1">
            {filteredGuides.map((guide) => {
              const active = guide.id === activeGuide.id;
              const Icon = CATEGORY_ICONS[guide.category] || BookOpen;
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => setSelectedGuideId(guide.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-sky-600 dark:text-white font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{guide.title}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {guide.category}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CategoryIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                  {activeGuide.category}
                </p>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${DIFFICULTY_COLORS[activeGuide.difficulty]}`}>
                  {activeGuide.difficulty.charAt(0).toUpperCase() + activeGuide.difficulty.slice(1)}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                  ~{activeGuide.estimatedTime}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                {activeGuide.title}
              </h3>
            </div>

            <AccordionSection
              title="Common Symptoms"
              icon={AlertTriangle}
              expanded={expandedSections.symptoms}
              onToggle={() => toggleSection('symptoms')}
            >
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {activeGuide.symptoms.map((sym, i) => (
                  <li key={i}>{sym}</li>
                ))}
              </ul>
            </AccordionSection>

            <AccordionSection
              title="Verification Steps"
              icon={CheckCircle2}
              expanded={expandedSections.checks}
              onToggle={() => toggleSection('checks')}
            >
              <ol className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                {activeGuide.checks.map((chk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{chk}</span>
                  </li>
                ))}
              </ol>
            </AccordionSection>

            <AccordionSection
              title="Reference Commands (Windows CMD / PowerShell / Switch CLI)"
              icon={Terminal}
              expanded={expandedSections.commands}
              onToggle={() => toggleSection('commands')}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {activeGuide.commands.length} command{activeGuide.commands.length !== 1 ? 's' : ''}
                </span>
                {activeGuide.commands.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllCommands(!showAllCommands)}
                  >
                    {showAllCommands ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    {showAllCommands ? 'Collapse' : 'Expand All'}
                  </Button>
                )}
              </div>
              <div className="rounded-lg bg-slate-900 text-slate-100 p-3 font-mono text-xs space-y-1 overflow-x-auto">
                {(showAllCommands ? activeGuide.commands : activeGuide.commands.slice(0, 3)).map((cmd, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sky-400">$</span>
                    <span className="flex-1 truncate">{cmd}</span>
                    <Button variant="ghost" size="sm" className="p-1 h-6" onClick={() => copyCommand(cmd)} aria-label="Copy command">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {!showAllCommands && activeGuide.commands.length > 3 && (
                  <p className="text-slate-500 text-center py-2 text-xs">
                    +{activeGuide.commands.length - 3} more commands (click Expand All)
                  </p>
                )}
              </div>
            </AccordionSection>
          </div>
        </div>
      </section>

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}

function SubnetInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function AccordionSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
        aria-expanded={expanded}
      >
        <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
        <span className="font-medium text-slate-900 dark:text-slate-100">{title}</span>
        <span className="ml-auto text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {expanded && <div className="p-4">{children}</div>}
    </div>
  );
}

function countBits(n: string): number {
  const num = parseInt(n, 10);
  return num.toString(2).split('1').length - 1;
}

function cidrFromMask(mask: string): number {
  return mask.split('.').reduce((acc, octet) => acc + countBits(octet), 0);
}