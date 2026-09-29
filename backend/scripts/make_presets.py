"""Build the presets: guard + CandidateProfile for each preset CV, plus a sample job description.

uv run python scripts/sample_cvs/make_sample_cvs.py   # build the PDFs first
uv run python scripts/make_presets.py                 # 8 LLM calls in parallel, ~10 s

Writes src/backend/data/presets.json (committed: the app never extracts a preset at runtime)
and copies each PDF to frontend/public/cvs/, so it can be downloaded to try the upload.
All people and employers are fictional.
"""

import asyncio
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from backend.chains.cv_profile import extract_profile
from backend.guard.jev import check_document
from backend.schemas.chat import InterviewSettings
from backend.schemas.presets import Preset
from backend.services.cv_reader import read_cv
from backend.services.presets import PRESETS_FILE

CVS = Path(__file__).parent / "out" / "cvs"
PUBLIC_CVS = Path(__file__).parents[2] / "frontend" / "public" / "cvs"


@dataclass
class Spec:
    id: str
    cv: str  # PDF name in scripts/out/cvs
    settings: InterviewSettings
    job_description: str


SPECS = [
    Spec(
        "anna-guugle",
        "01_clean",
        InterviewSettings(
            company="Guugle", role="Software Engineer", persona="friendly"
        ),
        """Software Engineer, Search Infrastructure (Guugle, Stockholm)

Guugle Search answers billions of questions a day, and most of them should come back in under 200 ms. You'll join the team that keeps the indexing and serving backends fast and reliable.

What you'll do:
- Design, build and run backend services in Go and Python
- Find and fix performance bottlenecks across services, from queries to caches
- Improve testing and deployment so changes ship safely several times a day
- Review code and help less experienced engineers grow

What we're looking for:
- 4+ years building backend systems in production
- Solid knowledge of databases, messaging (e.g. Kafka) and distributed systems
- Experience with Docker, Kubernetes and a public cloud
- You measure before you optimise, and you explain trade-offs clearly

Nice to have: search or ranking systems, on-call experience.""",
    ),
    Spec(
        "lukas-headbook",
        "09_career_changer",
        InterviewSettings(
            company="HeadBook", role="Junior Web Developer", persona="neutral"
        ),
        """Junior Web Developer (HeadBook, Hamburg)

HeadBook connects small businesses with their neighbourhoods. Our Local Pages team builds the tools bakeries, cafés and shops use to show opening hours, menus and offers. We're looking for a junior developer who wants to learn fast.

What you'll do:
- Build and improve pages and forms with HTML, CSS and JavaScript
- Work on small backend features in Python (Flask) with a senior developer
- Fix bugs reported by business owners and write tests for your fixes
- Take part in code reviews and our weekly demo

What we're looking for:
- A first project you built yourself (a course project or a side project is fine)
- Basic HTML, CSS and one programming language, plus Git basics
- Curiosity and the patience to ask good questions
- Career changers are very welcome: tell us what you bring from your old job

Nice to have: JavaScript or React, experience working with customers.""",
    ),
    Spec(
        "priya-tesler",
        "10_embedded",
        InterviewSettings(
            company="Tesler", role="Embedded Software Engineer", persona="strict"
        ),
        """Embedded Software Engineer, Battery Systems (Tesler, Munich)

Tesler's battery packs are only as safe as the firmware that watches them. You'll write and test the software on our battery management controllers, from drivers to diagnostics.

What you'll do:
- Develop firmware in C and C++ for ARM Cortex-M controllers running an RTOS
- Implement and debug communication over CAN, SPI and I2C
- Build hardware-in-the-loop tests and keep them running in CI
- Analyse field failures together with the hardware team

What we're looking for:
- 3+ years of embedded development in C or C++
- Hands-on experience with an RTOS (FreeRTOS, Zephyr or similar)
- Confident with an oscilloscope and a logic analyser
- Careful work: you know why timing and memory matter on small devices

Nice to have: automotive diagnostics (UDS), functional safety (ISO 26262), Python for test tools.""",
    ),
    Spec(
        "chloe-instakilogram",
        "11_marketing",
        InterviewSettings(
            company="Instakilogram", role="Social Media Manager", persona="friendly"
        ),
        """Social Media Manager, Brand (Instakilogram, Paris)

Instakilogram's own brand accounts show people what the app can do. We're looking for someone who can make our channels fun, useful and measurably bigger.

What you'll do:
- Plan and publish content for Instakilogram's brand accounts, with a focus on short video
- Work with creators on campaigns, from the brief to the results
- Manage a paid social budget and report what worked and what didn't
- Keep an eye on trends and turn the good ones into ideas quickly

What we're looking for:
- 3+ years managing social media for a brand or agency
- Examples of content you made and the numbers behind it (reach, engagement, growth)
- Experience with ads managers and analytics tools
- A clear, friendly writing voice and a sense of humour

Nice to have: video editing, community management, French and English.""",
    ),
    Spec(
        "tomasz-netflux",
        "12_data_analyst",
        InterviewSettings(company="Netflux", role="Data Analyst", persona="strict"),
        """Data Analyst, Viewer Engagement (Netflux, Warsaw)

Why do some viewers binge a series and others stop after one episode? Our engagement team answers questions like this for the product and content teams.

What you'll do:
- Write SQL to explore viewing and subscription data
- Build and maintain dashboards the product teams use every week
- Analyse A/B tests and explain the results in plain language
- Automate recurring reports and keep data definitions consistent

What we're looking for:
- 1–3 years in a data analyst role, or a strong internship
- Very good SQL and working knowledge of Python (pandas)
- Experience with a BI tool such as Tableau or Looker
- You can say what a number means, and when it doesn't mean much

Nice to have: dbt, experiment design, streaming or e-commerce data.""",
    ),
    Spec(
        "aisha-amazin",
        "13_product",
        InterviewSettings(
            company="Amazin", role="Senior Product Manager", persona="strict"
        ),
        """Senior Product Manager, Checkout (Amazin', London)

Every order on Amazin' ends in checkout, so small improvements here are worth a lot. You'll own the checkout experience for our European marketplaces.

What you'll do:
- Set the checkout strategy and roadmap together with engineering and design
- Find customer problems through research and data, and decide what to solve first
- Run experiments and turn the results into decisions
- Work with payments, legal and support teams across several countries

What we're looking for:
- 5+ years of product management, some of it on e-commerce or payments products
- A track record of launches with measurable results
- Comfortable with data: you can read an experiment and write basic SQL
- You write clearly and can say no with good reasons

Nice to have: experience leading several teams, fintech or banking background.""",
    ),
    Spec(
        "jonas-goldman-sax",
        "14_finance",
        InterviewSettings(
            company="Goldman Sax", role="Financial Analyst", persona="strict"
        ),
        """Financial Analyst, Mergers & Acquisitions (Goldman Sax, Frankfurt)

Our M&A team advises mid-sized industrial companies on acquisitions and sales. As an analyst you'll build the models and materials behind every deal.

What you'll do:
- Build financial models, DCF valuations and comparable company analyses
- Prepare pitch books, investment memos and board presentations
- Research industries and companies, and check the numbers carefully
- Support due diligence together with clients, lawyers and auditors

What we're looking for:
- 2–4 years in investment banking, corporate finance, audit or consulting
- Very strong Excel and financial modelling skills
- A solid understanding of accounting (IFRS or US GAAP)
- Precise work under time pressure, and clear written English

Nice to have: CFA progress, Bloomberg or Capital IQ, experience with industrial companies.""",
    ),
    Spec(
        "sofia-starbacks",
        "15_barista",
        InterviewSettings(company="Starbacks", role="Barista", persona="friendly"),
        """Barista (Starbacks, Porto Ribeira)

Our new riverside store opens in spring, and we're looking for baristas who make great coffee and make guests feel welcome, even in the morning rush.

What you'll do:
- Prepare espresso drinks, filter coffee and seasonal specials to our recipes
- Welcome guests, take orders and handle payments
- Keep the bar clean and follow food safety rules
- Help new team members learn the machines and routines

What we're looking for:
- Experience as a barista or in a busy café or restaurant
- Friendly, calm and reliable, also when the queue is long
- Able to work early mornings and weekends
- Good English; Portuguese is a plus

Nice to have: latte art, a barista certificate, ideas for making service faster.""",
    ),
]


async def build(spec: Spec) -> Preset:
    cv_text = read_cv((CVS / f"{spec.cv}.pdf").read_bytes())
    cv, jd = await asyncio.gather(
        check_document("cv", cv_text),
        check_document("job_description", spec.job_description),
    )
    # our own texts: a block here means a bug in the preset or the guard, so stop
    for kind, verdict in (("cv", cv), ("job description", jd)):
        if verdict.blocked:
            raise RuntimeError(f"{spec.id}: {kind} blocked ({verdict.blocked})")

    profile = await extract_profile(cv_text)
    return Preset(
        id=spec.id,
        settings=spec.settings,
        job_description=spec.job_description,
        profile=profile,
        cv_file=f"/cvs/{spec.id}.pdf",
    )


async def main() -> None:
    presets = await asyncio.gather(*(build(spec) for spec in SPECS))

    PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PRESETS_FILE.write_text(
        json.dumps(
            [preset.model_dump(mode="json") for preset in presets],
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    PUBLIC_CVS.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        shutil.copyfile(CVS / f"{spec.cv}.pdf", PUBLIC_CVS / f"{spec.id}.pdf")

    for preset in presets:
        p = preset.profile
        print(
            f"{preset.id:22} {p.first_name}, {p.seniority}, {p.years_experience} y, "
            f"{len(p.skills)} skills, {len(p.experience)} jobs | {p.headline}"
        )
    print(f"\n{len(presets)} presets → {PRESETS_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
