import type { ParsedJD, ParsedResume, FitAnalysis } from "./schemas.js";

export const mockParsedJD: ParsedJD = {
  company: "Acme Cloud Inc.",
  role: "Staff Software Engineer",
  level: "Staff",
  team: "Platform Infrastructure",
  requiredSkills: [
    { name: "Distributed Systems", category: "domain", priority: "required" },
    { name: "Go", category: "language", priority: "required" },
    { name: "Rust", category: "language", priority: "required" },
    { name: "Kubernetes", category: "platform", priority: "required" },
    { name: "Docker", category: "tool", priority: "required" },
    { name: "Observability (Prometheus/Grafana/Jaeger)", category: "tool", priority: "required" },
    { name: "Communication Skills", category: "soft-skill", priority: "required" },
  ],
  preferredSkills: [
    { name: "gRPC", category: "framework", priority: "preferred" },
    { name: "Service Mesh (Istio/Envoy)", category: "tool", priority: "preferred" },
    { name: "Open Source Contributions", category: "other", priority: "nice-to-have" },
    { name: "Kafka", category: "tool", priority: "preferred" },
    { name: "Platform Engineering", category: "domain", priority: "preferred" },
  ],
  responsibilities: [
    "Lead design and implementation of scalable, fault-tolerant distributed systems",
    "Define technical strategy for the platform infrastructure team (6 engineers)",
    "Own critical path services including API gateway, service mesh, and observability stack",
    "Drive cross-team technical initiatives",
    "Mentor senior engineers and conduct architecture reviews",
    "Establish engineering best practices",
    "Collaborate with Product and SRE teams",
    "Contribute to on-call rotation for Tier-1 services",
  ],
  techStack: [
    "Go", "Rust", "Kubernetes", "Docker", "Terraform", "AWS",
    "PostgreSQL", "Redis", "Kafka", "gRPC", "Prometheus", "Grafana",
    "Jaeger", "ArgoCD", "GitHub Actions",
  ],
  culture: [
    "Engineering excellence",
    "Ownership mentality",
    "Fast-growing company",
    "Hybrid work (San Francisco)",
  ],
  redFlags: [
    "On-call rotation for Tier-1 services could mean high-pressure incidents",
    "8+ years experience with 2+ at Staff level is a high bar",
  ],
  salaryRange: "$220,000 - $280,000 base + equity + benefits",
};

export const mockParsedResume: ParsedResume = {
  summary:
    "Experienced software engineer with 7+ years building scalable backend systems and cloud-native applications. Passionate about clean architecture, developer tooling, and distributed systems.",
  skills: [
    { name: "TypeScript", category: "language", priority: "required" },
    { name: "JavaScript", category: "language", priority: "required" },
    { name: "Python", category: "language", priority: "required" },
    { name: "Java", category: "language", priority: "required" },
    { name: "Node.js", category: "framework", priority: "required" },
    { name: "React", category: "framework", priority: "required" },
    { name: "Docker", category: "tool", priority: "required" },
    { name: "Kubernetes", category: "platform", priority: "required" },
    { name: "AWS", category: "platform", priority: "required" },
    { name: "Terraform", category: "tool", priority: "required" },
    { name: "PostgreSQL", category: "tool", priority: "required" },
    { name: "Redis", category: "tool", priority: "required" },
    { name: "Kafka", category: "tool", priority: "required" },
    { name: "Prometheus", category: "tool", priority: "required" },
    { name: "Grafana", category: "tool", priority: "required" },
    { name: "GitHub Actions", category: "tool", priority: "required" },
    { name: "Microservices Architecture", category: "methodology", priority: "required" },
    { name: "CI/CD", category: "methodology", priority: "required" },
  ],
  experiences: [
    {
      company: "TechScale Inc.",
      role: "Senior Software Engineer",
      duration: "3 years",
      highlights: [
        "Designed real-time event processing pipeline handling 50K events/sec using Node.js and Kafka",
        "Led migration of monolithic API to microservices architecture, reducing deployment time by 70%",
        "Built internal developer platform with automated CI/CD using GitHub Actions and Docker",
        "Mentored 3 junior engineers; led weekly architecture review sessions",
        "Implemented distributed caching layer with Redis, reducing API latency by 40%",
      ],
      techUsed: ["TypeScript", "Node.js", "PostgreSQL", "Redis", "Kafka", "Docker", "AWS", "GitHub Actions"],
    },
    {
      company: "DataFlow Systems",
      role: "Software Engineer II",
      duration: "2.8 years",
      highlights: [
        "Built high-throughput data ingestion service processing 5TB/day using Python and Apache Spark",
        "Designed REST APIs serving 3K+ RPS with 99.9% uptime SLA",
        "Implemented observability stack: Prometheus metrics, Grafana dashboards, PagerDuty alerting",
        "Authored open-source Prometheus exporter with 200+ GitHub stars",
        "Led incident response; reduced MTTR by 50% through runbook automation",
      ],
      techUsed: ["Python", "Java", "Apache Spark", "PostgreSQL", "Prometheus", "Grafana", "Terraform", "AWS"],
    },
    {
      company: "WebCraft Solutions",
      role: "Junior Software Engineer",
      duration: "1.7 years",
      highlights: [
        "Developed full-stack web applications using React and Node.js",
        "Built automated testing framework increasing coverage from 30% to 85%",
        "Managed deployments to AWS using CloudFormation",
      ],
      techUsed: ["JavaScript", "React", "Node.js", "Express", "MongoDB", "AWS"],
    },
  ],
  education: [
    {
      institution: "University of California, Davis",
      degree: "Bachelor of Science",
      field: "Computer Science",
      year: "2017",
    },
  ],
  certifications: [
    "AWS Solutions Architect Associate (2023)",
    "Certified Kubernetes Application Developer (CKAD) (2024)",
  ],
  yearsOfExperience: 7.5,
};

export const mockFitAnalysis: FitAnalysis = {
  overallScore: 68,
  strongMatches: [
    {
      skill: "Kubernetes & Docker",
      evidence: "CKAD certified, used Docker extensively at TechScale for microservices migration and developer platform",
      strength: "strong",
    },
    {
      skill: "Observability (Prometheus/Grafana)",
      evidence: "Implemented full observability stack at DataFlow Systems; authored open-source Prometheus exporter",
      strength: "strong",
    },
    {
      skill: "Kafka / Event-Driven Architecture",
      evidence: "Built 50K events/sec pipeline at TechScale using Kafka",
      strength: "strong",
    },
    {
      skill: "AWS Cloud Infrastructure",
      evidence: "AWS Solutions Architect certified; used ECS, Lambda, RDS, S3 across multiple roles",
      strength: "strong",
    },
    {
      skill: "Mentoring & Architecture Reviews",
      evidence: "Mentored 3 engineers at TechScale, led weekly architecture review sessions",
      strength: "moderate",
    },
  ],
  partialMatches: [
    {
      skill: "Distributed Systems Design",
      evidence: "Built microservices and event pipelines, but hasn't explicitly worked on consensus protocols or partitioning strategies",
      strength: "moderate",
    },
    {
      skill: "High-Scale Systems (10K+ RPS)",
      evidence: "Designed APIs at 3K+ RPS and event pipeline at 50K events/sec — related but not directly 10K+ RPS API traffic",
      strength: "moderate",
    },
    {
      skill: "Platform Engineering / Developer Experience",
      evidence: "Built internal developer platform at TechScale — strong transferable experience",
      strength: "moderate",
    },
  ],
  gaps: [
    {
      skill: "Go or Rust",
      severity: "critical",
      suggestion: "The role requires strong Go or Rust proficiency. Consider building a side project in Go (faster ramp-up from Node.js background) and emphasize systems-thinking from event pipeline work.",
    },
    {
      skill: "Staff-Level Experience (2+ years)",
      severity: "critical",
      suggestion: "Currently at Senior level with 7.5 years total. Highlight staff-level scope: cross-team initiatives, architectural decisions, mentoring. Frame the microservices migration as a staff-level project.",
    },
    {
      skill: "gRPC / Protocol Buffers",
      severity: "moderate",
      suggestion: "Listed as preferred. Quick to learn — consider a weekend project building a gRPC service.",
    },
    {
      skill: "Service Mesh (Istio/Envoy)",
      severity: "minor",
      suggestion: "Preferred skill. Familiarity with Kubernetes is a strong foundation. Mention willingness to ramp up.",
    },
  ],
  overqualified: [
    "Frontend experience (React) — the role is purely infrastructure-focused",
    "Data processing at scale (5TB/day with Spark) — exceeds typical platform infra scope",
  ],
  reframingSuggestions: [
    {
      existingExperience: "Led monolith-to-microservices migration at TechScale",
      reframedAs: "Led a company-wide distributed systems re-architecture, defining service boundaries, deployment strategies, and reliability patterns",
      targetRequirement: "Lead the design and implementation of scalable, fault-tolerant distributed systems",
    },
    {
      existingExperience: "Built internal developer platform with CI/CD",
      reframedAs: "Designed and shipped an internal platform engineering initiative that standardized deployment workflows for the engineering org",
      targetRequirement: "Background in developer experience / platform engineering",
    },
    {
      existingExperience: "50K events/sec Kafka pipeline + 3K RPS APIs",
      reframedAs: "Proven track record operating high-throughput distributed systems at scale, with hands-on experience in event-driven architectures and real-time data processing",
      targetRequirement: "Track record of designing and operating systems handling 10K+ RPS",
    },
  ],
  dealBreakers: [
    "No Go or Rust experience — this is listed as required and central to the team's tech stack",
    "No formal Staff-level title yet — the role requires 2+ years at Staff/Principal",
  ],
  competitiveAdvantages: [
    "CKAD certification + hands-on K8s experience shows deep container orchestration knowledge",
    "Open-source contribution (Prometheus exporter) demonstrates community engagement",
    "Strong observability background aligns perfectly with owning the observability stack",
    "Proven ability to reduce MTTR and improve incident response — directly relevant to Tier-1 on-call",
    "Full-stack background gives broader perspective for platform decisions affecting multiple teams",
  ],
};
