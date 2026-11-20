export const round = {
  title: 'The retired subnet',
  ticket: 'Tucson’s test lab has been decommissioned. The firewall change retires its dedicated allow rule.',
  destination: 'AWS case portal',
  port: 443,
  hint: 'Match each source IP to a rule that will still be present after the change. For these /24 rules, compare the first three octets.',
  rules: [
    { id: 'TUC-TEST', source: '10.42.8.0/24', remove: true },
    { id: 'PHX-PROD', source: '10.42.9.0/24', remove: false },
  ],
  branches: [
    { id: 'tucson', name: 'Tucson', ip: '10.42.8.75', intendedAccess: false },
    { id: 'phoenix', name: 'Phoenix', ip: '10.42.9.75', intendedAccess: true },
  ],
}
