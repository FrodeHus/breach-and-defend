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
};
