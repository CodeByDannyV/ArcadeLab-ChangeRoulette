import { makeNetworkCase } from './network-cases.mjs'
import { round } from './round.mjs'

// Each service has its own access workflow and maximum tolerable interruption in minutes.
const deployments = [
  ['Claims', 'Denver', 'Boise', 'claims portal', 'Claims staff issue emergency reimbursements', 30],
  ['Dispatch', 'Lima', 'Quito', 'dispatch desk', 'Dispatchers assign crews to time-sensitive calls', 5],
  ['Intake', 'London', 'Dublin', 'intake portal', 'Intake staff register arriving patients', 10],
  ['Freight', 'Lagos', 'Accra', 'freight queue', 'Dock teams release loaded trailers', 20],
  ['Payroll', 'Austin', 'Dallas', 'payroll desk', 'Payroll operators submit the pay batch', 60],
  ['Research', 'Tokyo', 'Osaka', 'lab registry', 'Researchers register archived samples', 90],
  ['Permits', 'Berlin', 'Vienna', 'permit desk', 'Inspectors retrieve field permits', 45],
  ['Grid', 'Nairobi', 'Kigali', 'outage desk', 'Coordinators assign restoration crews', 8],
  ['Parts', 'Sydney', 'Perth', 'parts portal', 'Technicians reserve replacement parts', 25],
  ['Returns', 'Seoul', 'Busan', 'returns desk', 'Returns agents authorize collection requests', 50],
]

// Addresses are relative to a site's assigned pair of adjacent /24 networks.
// The two-element vectors refer to the primary and peer endpoints in each policy.
const policies = [
  { name: 'Retire a site', text: 'Remove the permit for the retiring site. Its peer is staying online.', ips: ['0.35','1.75'], intent: [false,true], rules: [['PRIMARY','0.0/24',true],['PEER','1.0/24',false]] },
  { name: 'Shared permit', text: 'The change owner selected a shared permit for retirement while the peer still needs service.', ips: ['0.34','1.66'], intent: [false,true], rules: [['REGION','0.0/23',true]] },
  { name: 'Overlapping permit', text: 'An endpoint permit is scheduled for removal. Audit the regional permit that will survive the cleanup.', ips: ['0.98','1.39'], intent: [false,true], rules: [['HOST','0.98/32',true],['REGION','0.0/23',false]] },
  { name: 'Split the subnet', text: 'Replace broad coverage with the retained lower-half permit. The upper-half endpoint is scheduled to leave.', ips: ['0.127','0.128'], intent: [true,false], rules: [['BLOCK','0.0/23',true],['LOWER','0.0/25',false]] },
  { name: 'Backup egress', text: 'The first listed change endpoint moves to a backup gateway. Both sites must keep working. Inspect the source observed at the firewall.', ips: ['0.45','1.17'], next: ['2.45',null], intent: [true,true], rules: [['PRIMARY','0.0/24',false],['PEER','1.0/24',false]] },
  { name: 'Staged migration', text: 'One gateway switches addresses inside an approved migration prefix. Both sites are expected to stay online.', ips: ['0.54','1.63'], next: ['1.84',null], intent: [true,true], rules: [['OLD','0.0/24',true],['NEW','1.0/24',false]] },
  { name: 'Host exception', text: 'Retire the site-wide rule. A single named host has a retained exception and must keep access.', ips: ['0.89','0.90'], intent: [true,false], rules: [['SITE','0.0/24',true],['EXCEPTION','0.89/32',false]] },
  { name: 'Quarter boundary', text: 'Remove the migration permit and keep the upper quarter-block permit for the production endpoint.', ips: ['0.63','0.64'], intent: [false,true], rules: [['MIGRATION','0.0/25',true],['UPPER','0.64/26',false]] },
  { name: 'Paired cutover', text: 'Both gateways change their observed source. Both sites need continued access after the migration.', ips: ['0.23','1.93'], next: ['2.23','3.93'], intent: [true,true], rules: [['OLD','0.0/23',true],['TARGET','2.0/24',false]] },
  { name: 'End of service', text: 'The service owner approved withdrawal for both endpoints. Check for surviving exceptions.', ips: ['0.22','1.78'], intent: [false,false], rules: [['PRIMARY','0.0/24',true],['PEER','1.0/24',true]] },
]

function makeCase(service, policy, siteIndex, patternIndex) {
  const [group, cityA, cityB, destination, workflow, tolerance] = service
  const number = patternIndex * deployments.length + siteIndex + 1
  const prefix = `10.${60 + number}.`
  const cities = (siteIndex + patternIndex) % 2 ? [cityB, cityA] : [cityA, cityB]
  const branches = cities.map((name, i) => ({
    id: name.toLowerCase(), name, ip: prefix + policy.ips[i],
    afterIp: policy.next?.[i] ? prefix + policy.next[i] : undefined,
    intendedAccess: policy.intent[i],
  }))
  const rules = policy.rules.map(([id, source, remove]) => ({ id, source: prefix + source, remove }))
  // Local continuity agreements make the same proposed maintenance behave differently by service.
  let localNote = ''
  if ([1, 4, 7].includes(siteIndex)) {
    const protectedSite = branches[siteIndex % 2]
    rules.push({ id: 'CONTINUITY', source: protectedSite.ip + '/32', remove: false })
    localNote = ` A continuity permit remains for ${protectedSite.name}’s original source.`
  } else if ([2, 6, 9].includes(siteIndex)) {
    const movingSite = branches[1]
    movingSite.afterIp = prefix + '4.18'
    localNote = ` ${movingSite.name} also cuts over to its recovery gateway in this window.`
  } else if (siteIndex === 5) {
    rules.push({ id: 'LAB-MIRROR', source: prefix + '2.0/23', remove: false })
    localNote = ' The research mirror retains a permit for its recovery prefix.'
  }
  const recoveryFactor = [0.6, 1.5, 3][(siteIndex + patternIndex * 2) % 3]
  return {
    id: `CR-${String(number + 1).padStart(3, '0')}`,
    title: `${group} · ${policy.name}`, family: policy.name,
    ticket: policy.text + localNote, destination, port: 443, branches,
    rules,
    hint: 'Compare each post-change source with every kept prefix. One surviving match is enough. For risk, compare recovery time to the service tolerance, then consult the matrix.',
    readiness: { workflow, tolerance, recovery: Math.max(1, Math.round(tolerance * recoveryFactor)), rehearsal: (patternIndex + Math.floor(siteIndex / 3)) % 3 },
  }
}

export const firewallCatalog = [
  { ...round, id: 'CR-001', family: 'Retire a site', readiness: { workflow: 'Caseworkers open new case records', tolerance: 30, recovery: 15, rehearsal: 0 } },
  ...policies.flatMap((policy, i) => deployments.map((service, j) => makeCase(service, policy, j, i))),
]

export const catalog = firewallCatalog.map((ticket, i) => i === 0 ? ticket :
  makeNetworkCase(ticket, Math.floor((i - 1) / deployments.length), (i - 1) % deployments.length))
