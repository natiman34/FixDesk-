import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  CheckSquare,
  Info,
  RotateCcw,
  Square,
  Terminal,
} from 'lucide-react';
import { calculateSubnet } from '../core/logic/subnet';
import { Button, Field, Input, PageHeader, Select } from '../components/ui/Primitives';

interface ChecklistStep {
  id: string;
  layer: string;
  title: string;
  detail: string;
  command: string;
}

const DIAGNOSTIC_STEPS: ChecklistStep[] = [
  {
    id: 'phy',
    layer: 'Layer 1 · Physical',
    title: 'Verify physical link lights & cable seating',
    detail: 'Confirm RJ45 link/activity LEDs on NIC and switch port, or check Wi-Fi radio toggle and SSID signal strength.',
    command: 'netsh interface show interface',
  },
  {
    id: 'dhcp',
    layer: 'Layer 2/3 · Addressing',
    title: 'Confirm valid DHCP lease (avoid 169.254.x.x APIPA)',
    detail: 'Ensure the workstation received an IP address, subnet mask, default gateway, and DNS servers on the expected VLAN.',
    command: 'ipconfig /all',
  },
  {
    id: 'gw',
    layer: 'Layer 3 · Gateway',
    title: 'Test local default gateway reachability',
    detail: 'Ping the subnet default gateway to isolate local LAN/VLAN faults from upstream WAN routing issues.',
    command: 'ping -n 4 <gateway-ip>',
  },
  {
    id: 'dns',
    layer: 'Layer 7 · DNS',
    title: 'Validate internal and external DNS resolution',
    detail: 'Test resolving an internal hostname and a public FQDN. Flush local resolver cache if stale records persist.',
    command: 'nslookup intranet.local && ipconfig /flushdns',
  },
  {
    id: 'route',
    layer: 'Layer 3 · Routing & WAN',
    title: 'Trace path beyond firewall/router',
    detail: 'Identify where packets drop across ISP gateway hops or site-to-site VPN tunnels.',
    command: 'tracert -d 1.1.1.1',
  },
  {
    id: 'port',
    layer: 'Layer 4 · Firewall & Ports',
    title: 'Verify required TCP service ports & proxy policy',
    detail: 'Check Windows Defender Firewall profile (Domain/Private/Public) and verify outbound TCP 443/53/9100 access.',
    command: 'Test-NetConnection -ComputerName <host> -Port 443',
  },
];

interface TroubleshootingGuide {
  id: string;
  title: string;
  category: string;
  symptoms: string[];
  checks: string[];
  commands: string[];
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
  },
];

export function NetworkToolsPage() {
  const [ipInput, setIpInput] = useState('192.168.10.45');
  const [cidrInput, setCidrInput] = useState(24);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [selectedGuideId, setSelectedGuideId] = useState<string>(NETWORK_GUIDES[0].id);

  const subnetResult = useMemo(() => calculateSubnet(ipInput, cidrInput), [ipInput, cidrInput]);

  const completedCount = useMemo(
    () => DIAGNOSTIC_STEPS.filter((s) => checkedSteps[s.id]).length,
    [checkedSteps]
  );

  const activeGuide = useMemo(
    () => NETWORK_GUIDES.find((g) => g.id === selectedGuideId) ?? NETWORK_GUIDES[0],
    [selectedGuideId]
  );

  const toggleStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Tools & Diagnostics"
        description="Real IPv4 CIDR subnet calculations, structured OSI layer diagnostic checklists, and IT networking runbooks."
      />

      {/* Transparent Web vs Desktop Environment Notice */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            Browser Sandbox &amp; Native Desktop Utility Boundary
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
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Network Address</p>
                  <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {subnetResult.data.networkAddress}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Broadcast Address</p>
                  <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {subnetResult.data.broadcastAddress}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Subnet Mask</p>
                  <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {subnetResult.data.subnetMask}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Wildcard Mask</p>
                  <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {subnetResult.data.wildcardMask}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Usable Hosts</p>
                  <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {subnetResult.data.usableHosts.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Addresses</p>
                  <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {subnetResult.data.totalAddresses.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Usable Host Range</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {subnetResult.data.firstUsableHost} — {subnetResult.data.lastUsableHost}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Class &amp; Scope</span>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCheckedSteps({})}
              aria-label="Reset diagnostic checklist"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>

          <div className="space-y-2.5">
            {DIAGNOSTIC_STEPS.map((step) => {
              const checked = Boolean(checkedSteps[step.id]);
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
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {step.layer}
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {step.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{step.detail}</p>
                      <p className="text-[11px] font-mono text-sky-700 dark:text-sky-400 pt-0.5">
                        {step.command}
                      </p>
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
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <BookOpen className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Network Troubleshooting Runbooks
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-1">
            {NETWORK_GUIDES.map((guide) => {
              const active = guide.id === activeGuide.id;
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
                  <p className="truncate">{guide.category}</p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                {activeGuide.category}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                {activeGuide.title}
              </h3>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Common Symptoms
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {activeGuide.symptoms.map((sym, i) => (
                  <li key={i}>{sym}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Verification Steps
              </h4>
              <ol className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                {activeGuide.checks.map((chk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{chk}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                Reference Commands (Windows CMD / PowerShell / Switch CLI)
              </h4>
              <div className="rounded-lg bg-slate-900 text-slate-100 p-3 font-mono text-xs space-y-1 overflow-x-auto">
                {activeGuide.commands.map((cmd, i) => (
                  <div key={i}>$ {cmd}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
