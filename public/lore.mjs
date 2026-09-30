// Flavor quotes and learning texts, keyed by card name. Learning texts explain the real concept, never how to perform an attack.
export const LORE = {
  // Red team
  'Relay Node': {
    flavor: 'Bounce it through six countries and nobody knows where the signal was born.',
    by: 'Relay operator',
    learn:
      'Attackers rarely connect straight from their own machines. They route traffic through rented servers, compromised devices, and proxies so their activity is harder to trace and block. Defenders track known malicious infrastructure through threat intelligence, and takedowns of that infrastructure can slow a campaign down.',
  },
  'Recon Operator': {
    flavor: 'Before the first knock, I already know which window is open.',
    by: 'Recon Operator',
    learn:
      'Reconnaissance is the information-gathering stage of an attack: finding exposed systems, services, software versions, and people to target. Most of it looks like ordinary traffic or public browsing. Defenders reduce what can be learned by keeping an inventory of internet-facing systems and removing anything that does not need to be exposed.',
  },
  'Credential Broker': {
    flavor: 'Passwords are cheap. Access is priceless. I sell the difference.',
    by: 'Credential Broker',
    learn:
      'Stolen usernames and passwords are traded on criminal marketplaces, often collected by infostealer malware or taken from breaches. Access brokers sell working logins to other groups, who use them to walk in instead of breaking in. Unique passwords, MFA, and monitoring for leaked credentials limit the value of what is stolen. Recharge in the game represents this sustaining advantage, not literal recovery.',
  },
  'Phishing Courier': {
    flavor: 'Urgent. Confidential. From the CEO. Click before you think.',
    by: 'Phishing Courier',
    learn:
      'Phishing is a message crafted to trick someone into clicking a link, opening an attachment, sharing a code, or approving a request. It works by creating urgency, authority, or curiosity so the target acts before thinking. Verifying unexpected requests through a separate channel and making it easy to report suspicious messages are strong defenses.',
  },
  'Payload Runner': {
    flavor: 'The door opened for one. It never closes for the rest.',
    by: 'Payload Runner',
    learn:
      'A first-stage payload is often small, designed only to get a foothold and then download more capable tools, a pattern called a loader or dropper. Stopping the first stage early prevents everything that follows. Application control, email and web filtering, and endpoint detection each give a chance to break the chain.',
  },
  'Rogue Access Point': {
    flavor: 'Free airport Wi-Fi. What could possibly go wrong?',
    by: 'Rogue Access Point',
    learn:
      'A rogue access point is an unauthorized wireless network, sometimes set up to imitate a trusted one so devices connect automatically. It can expose unencrypted traffic or push users toward fake login pages. Encrypted connections, certificate validation, VPNs on untrusted networks, and wireless monitoring reduce the risk. Stealth in the game models this different attack path.',
  },
  'Session Hijacker': {
    flavor: 'Why pick the lock when you left the door propped open?',
    by: 'Session Hijacker',
    learn:
      'After you log in, a website keeps you signed in with a session token, often stored in a cookie. An attacker who steals that token can act as you without knowing your password or passing MFA. Short session lifetimes, binding sessions to the device, and the ability to revoke sessions centrally all shrink the window of misuse.',
  },
  'Lateral Mover': {
    flavor: 'One laptop is a foothold. The network is a highway.',
    by: 'Lateral Mover',
    learn:
      'Lateral movement is how an attacker spreads from the first compromised machine to others, usually by reusing credentials and normal admin tools. The goal is to reach valuable systems such as domain controllers or file servers. Network segmentation, limiting admin rights, and watching for unusual remote logins make each step harder and louder.',
  },
  'Persistence Agent': {
    flavor: 'Reboot all you like. I wake up with you.',
    by: 'Persistence Agent',
    learn:
      'Persistence is any mechanism that lets an attacker keep access after a reboot, password change, or partial clean-up, such as scheduled tasks, new accounts, or startup entries. Removing the malware you can see may leave other footholds behind. Thorough investigation and rebuilding from known-good sources help ensure access is fully removed.',
  },
  'Supply Chain Implant': {
    flavor: 'You trusted the update. So did ten thousand others.',
    by: 'Supply Chain Implant',
    learn:
      'A supply chain attack compromises something you trust, such as a software vendor, library, or service provider, so the malicious code arrives through a legitimate channel. One compromise can reach thousands of victims at once. Software bills of materials, signed builds, vendor risk reviews, and monitoring what trusted software actually does all help.',
  },
  'Exfiltration Drone': {
    flavor: 'Quiet in, heavy out. Nobody weighs the cargo.',
    by: 'Exfiltration Drone',
    learn:
      'Data exfiltration is the unauthorized transfer of data out of an organization, often hidden in normal-looking traffic or sent to cloud storage. Many attacks now steal data before or instead of encrypting it. Data loss prevention, egress monitoring, and alerts on unusual upload volumes help defenders notice data leaving.',
  },
  'Ransomware Engine': {
    flavor: 'Your files are safe. They are simply no longer yours.',
    by: 'Ransomware Engine',
    learn:
      'Ransomware encrypts files or systems and demands payment for the key. Modern groups often steal data first and threaten to publish it, which is called double extortion. Offline or immutable backups, tested recovery plans, and early detection of the intrusion that comes before encryption are the most effective preparation.',
  },
  'Campaign Architect': {
    flavor: 'Every piece is a distraction. Together, they are the plan.',
    by: 'Campaign Architect',
    learn:
      'Serious attacks are campaigns: reconnaissance, initial access, privilege escalation, lateral movement, and impact, planned and coordinated over weeks. Frameworks such as the Cyber Kill Chain and MITRE ATT&CK describe these stages. Because every stage is a chance to detect and stop the attacker, defenders layer controls across the whole chain instead of relying on one.',
  },
  'Credential Phishing': {
    flavor: 'Your session has expired. Please sign in again.',
    by: 'A very convincing login page',
    learn:
      'Credential phishing sends victims to a fake login page that captures what they type. Some kits relay the login to the real site in real time, capturing one-time MFA codes as well. Phishing-resistant MFA such as passkeys and security keys defeats this because the credential only works on the genuine site.',
  },
  'Exploit Window': {
    flavor: 'The patch shipped Tuesday. You installed it Friday. I only needed Wednesday.',
    by: 'Exploit developer',
    learn:
      'A vulnerability becomes exploitable the moment it is known, and the time until it is patched is the window of exposure. Attackers often turn published fixes into working exploits within days. Knowing what you run, prioritizing internet-facing and actively exploited flaws, and patching quickly shrink that window.',
  },
  'Disrupt Telemetry': {
    flavor: 'An alarm that never rings is just decoration.',
    by: 'Intrusion specialist',
    learn:
      'Telemetry is the stream of logs and signals that security tools depend on. Attackers may stop logging services, tamper with security agents, or flood systems with noise to hide. Alerting when a data source goes silent and protecting security tools from being disabled keep defenders from going blind. Countering a card is a game abstraction.',
  },
  'Open Source Recon': {
    flavor: 'You posted the org chart. I just read it.',
    by: 'Recon Operator',
    learn:
      'Open-source intelligence (OSINT) is information gathered from public sources such as websites, social media, job postings, and code repositories. It can reveal names, email formats, technologies in use, and even leaked secrets. Defenders run the same searches on themselves to find and reduce unnecessary exposure.',
  },
  'Denial of Service': {
    flavor: 'I do not need your secrets. I just need you offline.',
    by: 'Botnet controller',
    learn:
      'A denial-of-service attack makes a service unavailable, most often by flooding it with more traffic than it can handle. Distributed attacks (DDoS) use many machines at once. Upstream filtering, content delivery networks, rate limiting, and capacity planning help services stay available.',
  },
  'Token Replay': {
    flavor: 'Signed, sealed, and delivered. Twice.',
    by: 'Session Hijacker',
    learn:
      'A replay attack reuses a valid token or message that was captured earlier, so the system accepts it as genuine. Access tokens that live for hours give attackers plenty of time. Short token lifetimes, one-time nonces, binding tokens to a device, and fast revocation all limit replay.',
  },
  'Privilege Escalation': {
    flavor: 'User today. Administrator by lunch.',
    by: 'Lateral Mover',
    learn:
      'Privilege escalation is gaining higher permissions than you were given, for example going from a normal user to administrator. Attackers exploit unpatched flaws, misconfigured services, or overly broad permissions. Least privilege, prompt patching, and monitoring for new admin rights reduce how far a foothold can grow.',
  },
  'Erase Evidence': {
    flavor: 'If nobody saw it, did it happen?',
    by: 'Intrusion specialist',
    learn:
      'Attackers may delete logs, clear event history, or alter timestamps to hide what they did, a set of techniques called anti-forensics. This complicates investigation and can make an incident look smaller than it is. Sending logs to a central, append-only store that attackers cannot easily reach keeps a trustworthy record.',
  },
  'Rebuild Foothold': {
    flavor: 'You patched the door I used. Not the one I left.',
    by: 'Persistence Agent',
    learn:
      'If the root cause of a compromise is not found and fixed, attackers often return through the same weakness or through backup access they planted. Re-compromise shortly after clean-up is common. A good incident response closes the original entry point, rotates credentials, and verifies that no persistence remains.',
  },
  'Botnet Reserve': {
    flavor: 'Ten thousand toasters, one voice.',
    by: 'Botnet controller',
    learn:
      'A botnet is a network of compromised devices, often poorly secured routers, cameras, and other IoT gear, controlled remotely by an attacker. Botnets provide cheap, disposable capacity for spam, DDoS, and proxying attacks. Changing default passwords, updating device firmware, and coordinated law-enforcement takedowns shrink them.',
  },
  'Command Channel': {
    flavor: 'Every beacon checks in. Every order goes out.',
    by: 'Campaign Architect',
    learn:
      'Command and control (C2) is how malware on compromised machines receives instructions and sends back results, often disguised as normal web or DNS traffic. Regular check-ins called beacons can reveal it. Egress filtering, DNS monitoring, and spotting periodic connections to unusual destinations help find and cut these channels.',
  },
  'Disable Safeguard': {
    flavor: 'Your guard dog loves treats.',
    by: 'Intrusion specialist',
    learn:
      'Once attackers have enough privilege, they often try to turn off antivirus, endpoint detection, firewalls, or backups before launching the main attack. Tamper protection, alerting on security configuration changes, and limiting who can change those settings make this harder and noisier.',
  },
  // Blue team
  'Secure Datacenter': {
    flavor: 'Cold air, locked doors, and a very long checklist.',
    by: 'Facilities lead',
    learn:
      'Security depends on reliable infrastructure: power, cooling, physical access control, and well-maintained systems. Physical security keeps unauthorized people away from hardware. Redundancy and maintenance keep services running when parts fail.',
  },
  'SOC Trainee': {
    flavor: 'Is this alert real? Only one way to find out.',
    by: 'SOC Trainee, first shift',
    learn:
      'A security operations center (SOC) monitors alerts around the clock. Triage is the first step: gather context, decide whether an alert is a real threat or a false positive, and escalate when needed. Good triage keeps real incidents from being buried under noise.',
  },
  'Endpoint Sensor': {
    flavor: 'Every process, every file, every whisper.',
    by: 'Endpoint Sensor',
    learn:
      'Endpoint detection and response (EDR) tools run on laptops and servers, recording process activity, file changes, and network connections. They can detect suspicious behavior and let responders investigate or isolate a device remotely. They only help if they are deployed everywhere, kept updated, and actually monitored.',
  },
  'Incident Responder': {
    flavor: 'Contain first. Panic never.',
    by: 'Incident Responder',
    learn:
      'Incident response follows a structured process: preparation, detection and analysis, containment, eradication, recovery, and lessons learned. Responders act quickly to limit damage while preserving the evidence needed to understand what happened. A rehearsed plan makes a real incident far less chaotic.',
  },
  'Awareness Champion': {
    flavor: 'If it feels off, report it. You will never get in trouble for asking.',
    by: 'Awareness Champion',
    learn:
      'People are often the first to notice an attack, such as a strange email, an unexpected MFA prompt, or an odd phone call. Security awareness is about making reporting easy and blame-free, so early warnings reach the security team quickly. One fast report can protect the whole organization.',
  },
  'Network Sentinel': {
    flavor: 'I cannot read every letter, but I see every envelope.',
    by: 'Network Sentinel',
    learn:
      'Network detection tools watch traffic patterns such as who talks to whom, how much, and when, to spot scanning, lateral movement, or command-and-control. Encryption hides content, but metadata like destinations and timing still reveal a lot. Network monitoring complements endpoint visibility.',
  },
  'Threat Hunter': {
    flavor: 'Alerts tell me what they caught. I look for what they missed.',
    by: 'Threat Hunter',
    learn:
      'Threat hunting is proactively searching for attackers who have evaded automated detection. Hunters form a hypothesis, such as "an attacker could be abusing remote admin tools here", and test it against available data. Findings improve detections for the future.',
  },
  'Segmentation Gateway': {
    flavor: 'You may enter this room. Not the next one.',
    by: 'Segmentation Gateway',
    learn:
      'Network segmentation divides a network into zones and controls which traffic may flow between them. If one segment is compromised, the attacker cannot freely reach the rest. Zero-trust designs take this further by verifying every connection instead of trusting anything inside the perimeter.',
  },
  'Forensic Investigator': {
    flavor: 'Every system remembers. You just have to ask it the right way.',
    by: 'Forensic Investigator',
    learn:
      'Digital forensics collects and analyzes evidence such as disk images, memory, and logs to reconstruct what happened during an incident. Preserving evidence before systems are changed matters, and so does documenting how it was handled. Careful analysis prevents premature conclusions and finds the true scope.',
  },
  'Identity Guardian': {
    flavor: 'Prove who you are. Then prove it again tomorrow.',
    by: 'Identity Guardian',
    learn:
      'Identity is the new perimeter: most attacks involve a stolen or abused account. Identity security covers how accounts are created, how people authenticate, how sessions are managed, and how lost access is recovered. Conditional access, MFA, and monitoring for risky sign-ins all protect identities.',
  },
  'Recovery Engineer': {
    flavor: 'Anyone can take a backup. I prove it restores.',
    by: 'Recovery Engineer',
    learn:
      'Recovery means getting systems and data back to a trusted, working state after an incident. That requires backups that are verified, restore points known to be free of malware, and procedures the team has rehearsed. Recovery time and recovery point objectives define how fast and how much data loss is acceptable.',
  },
  'Containment Team': {
    flavor: 'We do not chase the fire. We take away its air.',
    by: 'Containment lead',
    learn:
      'Containment limits the spread and impact of an incident: isolating hosts, disabling compromised accounts, and blocking malicious destinations. Short-term containment buys time, while long-term measures hold until eradication is complete. Acting too early or too late both carry risk, so decisions are weighed carefully.',
  },
  'Resilience Architect': {
    flavor: 'Assume breach. Design so it does not matter.',
    by: 'Resilience Architect',
    learn:
      'Cyber resilience is the ability to keep operating through an attack and recover quickly afterward. It combines prevention, detection, response, and recovery rather than betting everything on keeping attackers out. Resilient designs remove single points of failure and plan for things going wrong. Overflow in the game represents coordinated disruption of red’s campaign.',
  },
  'Revoke Sessions': {
    flavor: 'Everyone out. Sign in again, properly this time.',
    by: 'Identity Guardian',
    learn:
      'Revoking sessions forces every signed-in device to log in again, invalidating stolen session tokens. A password reset alone may leave existing sessions active. During an account compromise, responders typically reset credentials, revoke sessions and refresh tokens, and review MFA methods together.',
  },
  'Emergency Patch': {
    flavor: 'Change freeze? Not for this one.',
    by: 'Change advisory board',
    learn:
      'Patching fixes known vulnerabilities in software. Critical, actively exploited flaws may need emergency patching outside the normal schedule. Prioritize by risk: how exposed the system is, whether exploitation is happening in the wild, and what the system holds. Test quickly, deploy, and verify.',
  },
  'Block Execution': {
    flavor: 'Not on the list? Not running.',
    by: 'Endpoint policy',
    learn:
      'Application control, also called allowlisting, only lets approved programs and scripts run. Even if malware reaches a machine, it cannot execute. Coverage depends on careful configuration, because overly broad rules or trusted tools that can run arbitrary code leave gaps.',
  },
  'Correlate Logs': {
    flavor: 'One alert is noise. Five alerts in a row is a story.',
    by: 'SOC analyst',
    learn:
      'Log correlation combines events from many sources, such as sign-ins, endpoints, firewalls, and cloud services, to see the bigger picture. A security information and event management (SIEM) system automates this. A failed login alone means little; failed logins followed by a success from a new country is worth investigating.',
  },
  'Disrupt Infrastructure': {
    flavor: 'Your servers, your domains, your wallets. All frozen.',
    by: 'Joint takedown task force',
    learn:
      'Defenders, companies, and law enforcement can work together to take down attacker infrastructure: seizing domains, shutting down servers, and sinkholing botnet traffic. Coordinated disruption raises the attacker’s cost and can dismantle a whole operation, though groups often rebuild.',
  },
  'Restore Backup': {
    flavor: 'Tuesday’s data, clean and whole. Welcome back.',
    by: 'Recovery Engineer',
    learn:
      'A backup is only useful if it can actually be restored. Follow the 3-2-1 rule: three copies of data, on two types of media, with one offsite or offline. Test restores regularly and protect backup systems with separate credentials, because attackers target backups first.',
  },
  'Least Privilege': {
    flavor: 'You need to read the file. You do not need to own the building.',
    by: 'Access review',
    learn:
      'The principle of least privilege gives every user, service, and process only the permissions it needs, and nothing more. When an account is compromised, its limited rights limit the damage. Regular access reviews and just-in-time admin access keep permissions from quietly piling up.',
  },
  'Isolate Host': {
    flavor: 'You are quarantined until further notice.',
    by: 'Incident Responder',
    learn:
      'Host isolation cuts a compromised device off from the network while keeping it running, so the attacker cannot spread or communicate but evidence in memory is preserved. Most EDR tools can isolate a host with one action. Responders weigh the business impact of taking a system offline.',
  },
  'Clean Rebuild': {
    flavor: 'Burn it to the ground. Build it back from the blueprint.',
    by: 'Recovery Engineer',
    learn:
      'After a serious compromise, rebuilding systems from trusted images is often safer than trying to clean them, since hidden persistence can survive clean-up. Infrastructure as code and golden images make rebuilding fast and consistent. The original entry point must be fixed, or the attacker simply returns.',
  },
  'Immutable Backup': {
    flavor: 'Write once. Delete never. Not even by you.',
    by: 'Backup vault',
    learn:
      'Immutable backups cannot be changed or deleted for a set retention period, even by an administrator. That protects restore points from ransomware operators who try to destroy backups before encrypting. Retention settings, access controls, and regular restore tests still matter.',
  },
  'Phishing-Resistant MFA': {
    flavor: 'Nice fake login page. My key does not speak to strangers.',
    by: 'Security key',
    learn:
      'Phishing-resistant MFA, such as FIDO2 security keys and passkeys, uses cryptography tied to the real website’s address, so credentials entered on a fake site do not work. SMS codes and push approvals can still be phished or relayed. This game models resistance to credential phishing only; session theft and account recovery abuse need other controls.',
  },
  'Configuration Audit': {
    flavor: 'Who opened port 3389 to the whole internet?',
    by: 'Configuration Audit',
    learn:
      'Misconfigurations, such as open storage, default passwords, and exposed admin interfaces, cause many breaches. Configuration audits compare systems against secure baselines like the CIS Benchmarks and flag risky changes. Automated, continuous checks catch drift before an attacker does.',
  },
  // Persistent Threats — red
  'Ghost Relay': {
    flavor: 'Burn the relay before they map it. We have spares.',
    by: 'Infrastructure handler',
    learn:
      'Campaigns often rotate the servers and domains they rely on, abandoning one before defenders can block it. Rapidly changing infrastructure makes simple blocklists age quickly. Defenders respond with behavior-based detection, domain reputation and fast sharing of indicators, so each discarded relay still teaches them something about the campaign.',
  },
  'Reconnaissance Outpost': {
    flavor: 'Nothing here touches the target. Not yet.',
    by: 'Outpost analyst',
    learn:
      'Much reconnaissance happens without touching a target at all: public records, job postings, certificate logs and exposed service banners reveal a surprising amount. Organizations reduce this exposure by inventorying what they publish, limiting unnecessary detail, and checking their own attack surface the way an outsider would.',
  },
  'Attack Surface Mapper': {
    flavor: 'Every forgotten server is a door someone left unlocked.',
    by: 'Surface mapper',
    learn:
      'An attack surface is every system, service and account reachable from outside. Forgotten test servers, old subdomains and unmanaged cloud resources are common weak points because nobody patches what nobody knows about. Attack surface management gives defenders a continuous inventory, so exposed assets are found and fixed first.',
  },
  'Beachhead Scout': {
    flavor: 'Get one foot in. The rest of the body follows.',
    by: 'Entry team lead',
    learn:
      'Initial access is the first point where an intruder gets inside, often through one weak account, an unpatched edge device or a phishing message. Attackers treat it as a beachhead for everything after. Multi-factor authentication, prompt patching of internet-facing systems and alerts on unusual first logins make a single foothold much harder to keep quiet.',
  },
  'Staged Loader': {
    flavor: 'The first stage is harmless. That is the point.',
    by: 'Malware operator',
    learn:
      'Many infections arrive in stages. A small loader establishes itself first, then fetches a heavier payload later, so the first file looks almost harmless. Defenders counter staging with application allow-listing, endpoint detection that watches what a process does rather than what it looks like, and blocking unexpected downloads.',
  },
  'Dead-Drop Courier': {
    flavor: 'Leave it where everyone posts. No one reads the comments.',
    by: 'Courier contact',
    learn:
      'A dead drop hides instructions or data inside legitimate public services, such as a shared document or a social media profile, so malicious traffic blends in with ordinary use. Defenders look for unusual patterns, like a server reading a public page on a fixed schedule. Even a lost channel can reveal how a campaign communicates.',
  },
  'Access Broker': {
    flavor: 'I do not break in. I sell the keys to people who do.',
    by: 'Access broker',
    learn:
      'Initial access brokers specialize in getting into organizations and selling that access to other criminal groups, such as ransomware operators. One quiet compromise can later become a very loud attack. Monitoring for stolen credentials, removing stale accounts and investigating small intrusions promptly all reduce what a broker has to sell.',
  },
  'Dormant Implant': {
    flavor: 'Patience is a feature, not a bug.',
    by: 'Implant author',
    learn:
      'Persistence mechanisms let an intruder survive reboots and password changes, and some stay quiet for weeks before doing anything visible. Scheduled tasks, startup entries and new services are common hiding places. Defenders regularly review what starts automatically on their systems and compare it with a known-good baseline.',
  },
  'Living-off-the-Land Operator': {
    flavor: 'Why bring tools when the house already has them?',
    by: 'Intrusion operator',
    learn:
      'Living off the land means misusing tools that already exist on a system, such as scripting shells and administration utilities, instead of bringing obvious malware. Because the tools are legitimate, simple antivirus often ignores them. Defenders log how built-in tools are used, restrict who can run them, and alert on unusual command lines.',
  },
  'Redundant Handler': {
    flavor: 'Cut one line and the call comes in on another.',
    by: 'Campaign handler',
    learn:
      'Persistent campaigns often keep more than one way back in, like a second remote-access tool or a hidden account. Removing only the obvious foothold invites a quick return. Effective incident response scopes the whole intrusion first, removes every known access path at the same time, and keeps watching for reinfection afterwards.',
  },
  'Coordinated Intrusion Lead': {
    flavor: 'Three quiet doors at once make one loud problem.',
    by: 'Operations lead',
    learn:
      'Organized intrusion groups divide work across operators and coordinate timing, using several footholds together once the campaign is ready. Lateral movement from one system to others turns a small incident into a large one. Network segmentation, limited administrative access and alerts on unusual internal connections keep one machine from reaching the rest.',
  },
  'Long-Haul Campaign': {
    flavor: 'We measure this operation in quarters, not days.',
    by: 'Campaign director',
    learn:
      'Advanced persistent threats are well-resourced groups that pursue a target for months or years and return after setbacks. They combine visible attacks with quieter supporting access. Defending against them relies on layered controls, threat intelligence about their known behavior, and treating each incident as possibly part of a larger campaign.',
  },
  'Map Trust Relationships': {
    flavor: 'Their partner has a quieter door and a key to theirs.',
    by: 'Recon lead',
    learn:
      'Organizations trust suppliers, partners and connected domains, and those trust relationships can become routes in. An attacker who compromises a smaller partner may inherit its access. Defenders inventory third-party connections, limit what each partner can reach and review trust settings regularly. Reuse in the game represents mapping work paying off again later.',
  },
  'Seed Access': {
    flavor: 'Plant enough seeds and one of them will grow.',
    by: 'Access planner',
    learn:
      'Intruders often plant several small footholds early, such as extra accounts or access tokens, so losing one does not end the campaign. Each one is easy to miss on its own. Defenders review newly created accounts and credentials, alert on changes to privileged groups, and expire access that nobody can explain.',
  },
  'Coordinated Pressure': {
    flavor: 'Hit the same wall harder. It will give.',
    by: 'Pressure team',
    learn:
      'Some attacks succeed simply by applying more resources than a defense was built to absorb, such as a denial-of-service flood. Defenders plan capacity, use services that absorb traffic spikes, and rehearse escalation so a surge does not overwhelm them. Overclock in the game represents committing extra resources for a bigger effect.',
  },
  'Burn the Channel': {
    flavor: 'We will never use that route again. Make it count.',
    by: 'Operation lead',
    learn:
      'Attackers sometimes spend a valuable capability, such as an undisclosed vulnerability or a trusted channel, knowing it will be discovered once used. Afterwards defenders can patch, block and share details, so the same trick rarely works twice. Fast patching and shared threat intelligence make every burned channel expensive.',
  },
  'Cascading Outage': {
    flavor: 'Pull one dependency and watch the whole stack fall.',
    by: 'Disruption specialist',
    learn:
      'Modern systems depend on each other, so a failure in one shared service, such as sign-in or name resolution, can cascade into many outages at once, sometimes including the attacker' +
      "'" +
      's own tools. Mapping dependencies and building redundancy for critical services limit how far a failure spreads. Overclock in the game represents a broader, costlier disruption.',
  },
  'Adaptive Payload': {
    flavor: 'Tell me what it runs on. I will ship the right module.',
    by: 'Payload engineer',
    learn:
      'Modular malware can download new components after infection and adapt to what it finds. The core stays small while its capability grows. Defenders watch for processes that suddenly load new code or contact new servers, and contain infected systems before extra modules arrive. Overclock in the game represents investing in a larger upgrade.',
  },
  'Exploit the Handoff': {
    flavor: 'Hit them during the shift change. Nobody owns the alert.',
    by: 'Timing specialist',
    learn:
      'Transitions create gaps: shift changes, maintenance windows, migrations and handovers between teams can leave an alert without a clear owner. Attackers often time activity for nights, weekends and holidays. Clear handover procedures, round-the-clock monitoring and extra care during changes keep busy moments from becoming blind spots.',
  },
  'Signal Spoof': {
    flavor: 'Give them a thousand alarms. They will miss the real one.',
    by: 'Deception operator',
    learn:
      'Attackers can generate noise, such as spoofed traffic or decoy activity, to distract defenders and exhaust their attention. Alert fatigue makes it easier to dismiss a real warning. Defenders tune detections to cut false positives, group related alerts into single incidents, and prioritize by impact so distractions do not bury the signal.',
  },
  'Reopened Connection': {
    flavor: 'Pull back, let them relax, then dial in again.',
    by: 'Access operator',
    learn:
      'When intruders sense detection, they may pause, remove visible tools and return later through the same weakness if it was never fixed. Closing an incident too early invites that return. Defenders fix the root cause, reset affected credentials and keep monitoring after recovery. Reuse in the game represents an old access route used one more time.',
  },
  'Burn Credentials': {
    flavor: 'If it can be traced back to us, it does not exist.',
    by: 'Cleanup crew',
    learn:
      'Intruders may destroy artifacts they no longer need, such as used credentials, tools and logs, to hinder investigators. Deleting evidence often leaves its own traces, like gaps in logging. Defenders send logs to a separate, protected system as they are created, so records survive a wiped machine, and treat missing logs as a warning sign.',
  },
  'Disposable Cache': {
    flavor: 'Use it once, wipe it, move on.',
    by: 'Tooling handler',
    learn:
      'Campaigns often keep tools and stolen data in temporary places, such as rented cloud storage or a compromised file share, and abandon them after use. Short-lived infrastructure is hard to block in advance. Defenders watch for unusual storage use, large transfers to unexpected locations and accounts on cloud services the organization does not use.',
  },
  'Exfiltration Buffer': {
    flavor: 'Collect quietly, compress tightly, leave slowly.',
    by: 'Exfiltration operator',
    learn:
      'Before data is stolen, attackers often gather it in one place and compress it, then send it out in small amounts to avoid notice. That staging is a chance to catch them. Data loss prevention, alerts on unusual archive creation and monitoring of outbound traffic volume help defenders stop exfiltration while there is still time.',
  },
  'Distributed Command': {
    flavor: 'No single server to seize. No single head to cut off.',
    by: 'Command architect',
    learn:
      'Command-and-control is how attackers send instructions to compromised systems. Distributed designs spread that control across many servers, so taking one down does not stop the campaign. Defenders focus on behavior common to all of them, such as regular check-in traffic, and coordinate takedowns with providers and law enforcement.',
  },
  Backdoor: {
    flavor: 'Keep it quiet, keep it open, keep it ready.',
    by: 'Persistence engineer',
    learn:
      'A backdoor is any hidden way back into a system that bypasses normal sign-in, such as an unauthorized account or a remote-access tool. Intruders plant them so losing one entry point does not end a campaign. Defenders audit accounts and remote-access software against known-good baselines. Backdoor tokens in the game abstract these footholds into a spendable resource.',
  },
  // Persistent Threats — blue
  'Forensic Repository': {
    flavor: 'Copy everything first. Questions come after.',
    by: 'Evidence custodian',
    learn:
      'Investigations depend on preserved evidence: disk images, memory captures and logs copied before systems are cleaned or rebuilt. Storing these copies securely, with a record of who handled them, keeps them trustworthy. Preservation competes with restoring service for time and storage, so good response plans decide in advance what to keep.',
  },
  'Instrumented Datacenter': {
    flavor: 'Every rack reports. Every port has a voice.',
    by: 'Datacenter engineer',
    learn:
      'Instrumentation means collecting telemetry, such as logs, metrics and network flow records, so defenders can see what happened. Without it, investigations become guesswork. Collection has real costs in storage, processing and privacy, so teams choose the sources that matter most and synchronize clocks so events line up correctly.',
  },
  'Alert Triage Analyst': {
    flavor: 'Real, noise, or needs a second look. Next.',
    by: 'Triage analyst',
    learn:
      'Security teams receive far more alerts than they can investigate in depth. Triage quickly sorts them by likely impact and confidence, closing false positives and escalating real threats. Good triage relies on context, such as which system is involved and whether related alerts exist, plus feedback that improves noisy detections.',
  },
  'Canary Service': {
    flavor: 'Nobody should ever touch it. So when someone does, we know.',
    by: 'Deception engineer',
    learn:
      'Canaries and honeypots are decoy systems, files or credentials with no legitimate use. Because nobody should touch them, any interaction is a high-confidence warning that someone is exploring the network. They are cheap to deploy and rarely raise false alarms. Even when an intruder disables one, the attempt can reveal their presence.',
  },
  'Telemetry Curator': {
    flavor: 'Raw logs are noise until someone gives them shape.',
    by: 'Telemetry curator',
    learn:
      'Telemetry becomes useful when it is collected centrally, normalized into consistent fields and kept long enough to investigate. A curator decides which sources to collect, how long to keep them and how to protect them from tampering. Collection alone finds nothing; analysts still have to search, correlate and interpret the data.',
  },
  'Behavioral Monitor': {
    flavor: 'I do not care what it is called. I care what it does.',
    by: 'Detection engineer',
    learn:
      'Behavior-based detection looks at actions rather than known signatures: a document starting a command shell, an account signing in from two continents in an hour, or a process reading many files quickly. It catches new and disguised threats that signatures miss, and watching behavior during containment shows what an intruder was after.',
  },
  'Case Analyst': {
    flavor: 'Evidence first. Conclusions second. Always in that order.',
    by: 'Case analyst',
    learn:
      'Incident analysis turns scattered evidence into an understanding of what happened, how, and what is still at risk. Case management keeps findings, timelines and decisions in one record, so the whole team shares one picture. Well-analyzed evidence leads to targeted actions instead of guesses, and the record helps with reporting and later improvements.',
  },
  'Lockdown Coordinator': {
    flavor: 'Isolate it now. We will argue about blame later.',
    by: 'Response coordinator',
    learn:
      'Containment limits damage while an investigation continues: isolating a host, disabling a compromised account or blocking a malicious address. It buys time but does not remove the intruder. Teams prepare containment options in advance and weigh them carefully, since acting too loudly can warn an attacker before every access path is known.',
  },
  'Restoration Lead': {
    flavor: 'Know what you depend on before you need it back.',
    by: 'Recovery lead',
    learn:
      'Recovery goes faster when teams know in advance which systems matter most, what each one depends on and how to rebuild it. Restoring small, well-understood components first often brings critical services back sooner. Recovery plans, tested backups and dependency maps turn a stressful rebuild into a rehearsed procedure.',
  },
  'Adaptive Perimeter': {
    flavor: 'Same user, new country, new device. Ask again.',
    by: 'Access architect',
    learn:
      'Adaptive access control adjusts defenses to context, such as device health, location and recent behavior, instead of applying one fixed rule. A risky sign-in might need extra verification while a routine one passes smoothly. More context keeps defenses strict where it matters without blocking everyday work, as long as the signals are reliable.',
  },
  'Incident Commander': {
    flavor: 'One voice, one plan, one priority list.',
    by: 'Incident commander',
    learn:
      'During a major incident, an incident commander coordinates the response by assigning tasks, setting priorities and communicating decisions, rather than doing every technical step personally. A clear command structure prevents duplicated work and conflicting actions. Findings from investigators feed that coordination so the right team acts at the right time.',
  },
  'Resilient Service Mesh': {
    flavor: 'Lose a node, reroute, log it, keep serving.',
    by: 'Platform engineer',
    learn:
      'Resilient architectures keep services running when parts fail, using redundancy, automatic failover and limits on how failures spread. A service mesh manages traffic between application components and can add encryption and detailed telemetry along the way. Built this way, an attack or outage degrades a service instead of stopping it.',
  },
  'Reconstruct the Timeline': {
    flavor: 'Put every event in order and the story tells itself.',
    by: 'Forensic analyst',
    learn:
      'Timeline analysis arranges evidence from many sources, such as logs, file changes and alerts, into one chronological story. It reveals the first point of entry, what happened next and what may have been missed. Accurate timelines depend on synchronized clocks and preserved logs. Reuse in the game represents returning to an established timeline as new evidence appears.',
  },
  'Preserve the Scene': {
    flavor: 'Do not reboot it. Do not wipe it. Capture it.',
    by: 'First responder',
    learn:
      'Evidence can disappear quickly: memory is lost at shutdown and logs roll over. Preserving the scene means capturing volatile data and copying relevant logs before cleaning up, while recording who collected what and when. Preserved evidence keeps options open for analysis, legal action and learning, even when restoring service comes first.',
  },
  'Scoped Remediation': {
    flavor: 'Fix what we can prove. Then widen the net if we must.',
    by: 'Remediation lead',
    learn:
      'Remediation removes a threat and fixes the weakness it used. A narrowly scoped fix, such as cleaning one host, is fast and cheap; a broad one, such as resetting every credential, disrupts more but covers more. Teams choose the scope from what the evidence shows. Overclock in the game represents paying more for a broader response.',
  },
  'Restore Trusted State': {
    flavor: 'Roll back to the last state we can actually trust.',
    by: 'Recovery engineer',
    learn:
      'Restoring a trusted state means rebuilding systems from known-good backups or clean images instead of cleaning an infected machine in place. The backup must predate the intrusion and be protected from tampering, and restored systems are checked before going fully live. Overclock in the game represents extra effort to bring a service back ready for use.',
  },
  'Emergency Segmentation': {
    flavor: 'Close the internal gates. All of them. Now.',
    by: 'Network responder',
    learn:
      'Emergency segmentation cuts or restricts connections between parts of a network during an attack, such as blocking traffic between offices or isolating critical systems. It slows an intruder moving between systems and buys time. Because it also disrupts normal work, teams plan these steps in advance and know which connections must stay open.',
  },
  'Verify Provenance': {
    flavor: 'Signed, sourced and checked, or it does not run.',
    by: 'Release engineer',
    learn:
      'Provenance is the verifiable history of where software came from and how it was built. Code signing, software bills of materials and checked build pipelines help confirm that an update really came from its supplier unmodified. Verification can stop a tampered update, and a failed check is itself useful evidence for investigators.',
  },
  'Live Response': {
    flavor: 'Connect, collect, contain. Before it moves again.',
    by: 'Endpoint responder',
    learn:
      'Live response lets responders act directly on a running system: collecting evidence, stopping a malicious process or isolating the machine without waiting to image its disk. It is fast but needs care, because every action changes the system and may alert the intruder. Responders weigh disrupting the threat now against keeping a service available.',
  },
  'Break the Chain': {
    flavor: 'Remove the link it depends on and the rest falls apart.',
    by: 'Threat hunter',
    learn:
      'Attacks usually follow a chain of steps, and breaking any link can stop the sequence. Removing a supporting mechanism, such as a scheduled task that restarts malware, keeps a threat from coming back, and cleaning up leftover tools reduces recurrence. Overclock in the game represents taking the extra time to deal with that leftover material too.',
  },
  'Clean-Room Analysis': {
    flavor: 'Nothing leaves this network. Nothing enters it unchecked.',
    by: 'Malware analyst',
    learn:
      'Suspicious files are analyzed in isolated environments, such as sandboxes and clean-room networks, so they cannot harm production systems. Separating suspect material from trusted resources also makes recovery safer, because systems are rebuilt only from verified components. Isolation must be real: shared accounts or network links can undo it.',
  },
  'Continuity Plan': {
    flavor: 'The plan is boring. That is why it works at 3 a.m.',
    by: 'Continuity manager',
    learn:
      'Business continuity planning prepares an organization to keep essential services running during a disruption, with manual workarounds, alternate sites or reduced service. Plans are rehearsed so people know their roles under pressure, and keeping services up while investigating supports better recovery. Reuse in the game represents falling back on a prepared plan.',
  },
  'Analysis Workbench': {
    flavor: 'Same question, same steps, every time.',
    by: 'Senior analyst',
    learn:
      'Structured analysis, such as playbooks, checklists and shared investigation tools, helps analysts extract more from limited evidence and reach consistent conclusions. It reduces the chance of skipping a step under pressure and makes work easier to review. The process still depends on having good observations to analyze in the first place.',
  },
  'Recovery Runbook': {
    flavor: 'If the runbook is out of date, it is a story, not a plan.',
    by: 'Operations manager',
    learn:
      'A runbook is a step-by-step procedure for a known situation, such as restoring a database or replacing compromised keys. Good runbooks let people act quickly and correctly under stress. They rely on trusted resources, such as clean backups and spare capacity, and need regular testing as systems change, or they fail when they are needed most.',
  },
  'Continuous Validation': {
    flavor: 'Trust the control once. Then test it every day after.',
    by: 'Validation engineer',
    learn:
      'Continuous validation regularly tests whether security controls still work, for example by running safe simulations of known attack techniques and checking that alerts fire. Configurations drift and detections break silently, so repeated checks catch gaps early. Validation produces useful signals, but someone still has to act on what it finds.',
  },
  Indicator: {
    flavor: 'Small on its own. Decisive in the right hands.',
    by: 'Threat intelligence analyst',
    learn:
      'An indicator of compromise is evidence that suggests an intrusion, such as a malicious file fingerprint, a suspicious domain or an unusual sign-in. Indicators are most valuable when analyzed and shared: they help find other affected systems and block the same activity elsewhere. Indicator tokens in the game abstract observations that analysis turns into advantages.',
  },
};
