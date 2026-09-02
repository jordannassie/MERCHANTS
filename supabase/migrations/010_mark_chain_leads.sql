-- ── Migration 010: Mark corporate chain leads ────────────────────────────────
--
-- Retroactively sets category='corporate_chain', reduces score by 40 points,
-- and caps priority at 'good' (never 'hot') for leads whose outlet_name or
-- taxpayer_name matches a known national or large regional chain.
--
-- Safe to re-run (idempotent WHERE clause).
-- Does not touch records with status in ('won','lost','do_not_contact')
-- or records already marked as corporate_chain.

do $$
declare
  chain_patterns text[] := ARRAY[
    '%chipotle%','%little caesars%','%little caesar%',
    '%mcdonald%','%burger king%','%wendys%','%wendy s%',
    '%taco bell%','%subway%','%dominos%','%domino s%',
    '%pizza hut%','%papa johns%','%papa john%','%marcos pizza%',
    '%kfc%','%kentucky fried chicken%','%popeyes%',
    '%chick fil a%','%chickfila%','%whataburger%',
    '%jack in the box%','%sonic drive%','%dairy queen%',
    '%arbys%','%arby s%','%five guys%','%shake shack%',
    '%culvers%','%culver s%','%panda express%','%wingstop%',
    '%raising cane%','%churchs chicken%','%church s chicken%',
    '%freddy s%','%freddys%','%zaxbys%',
    '%torchy s%','%torchys%','%velvet taco%',
    '%mod pizza%','%blaze pizza%',
    '%applebees%','%applebee s%','%chilis%','%chili s%',
    '%olive garden%','%red lobster%','%longhorn steakhouse%',
    '%outback steakhouse%','%texas roadhouse%',
    '%dennys%','%denny s%','%ihop%','%waffle house%',
    '%cracker barrel%','%golden corral%','%hooters%',
    '%buffalo wild wings%','%dave buster%','%dave and buster%',
    '%starbucks%','%dutch bros%','%dunkin%',
    '%krispy kreme%','%smoothie king%',
    '%panera%','%jason s deli%','%jasons deli%',
    '%firehouse subs%','%jersey mike%','%jimmy john%',
    '%potbelly%','%schlotzsky%','%cinnabon%',
    '%walmart%','%wal mart%','%sams club%','%sam s club%',
    '%target corp%','%target store%',
    '%costco%','%home depot%','%lowes%','%lowe s%',
    '%best buy%','%gamestop%','%petsmart%','%petco%',
    '%academy sports%','%dicks sporting%','%dick s sporting%',
    '%dollar general%','%family dollar%','%dollar tree%',
    '%cvs%','%walgreens%','%rite aid%',
    '%7 eleven%','%7eleven%','%circle k%',
    '%jiffy lube%','%firestone%','%midas%','%autozone%','%auto zone%',
    '%o reilly auto%','%oreilly auto%','%advance auto%','%valvoline%',
    '%great clips%','%sport clips%','%supercuts%','%fantastic sams%',
    '%massage envy%','%european wax%',
    '%planet fitness%','%la fitness%','%anytime fitness%',
    '%orange theory%','%orangetheory%',
    '%amc theater%','%regal cinema%','%cinemark%',
    '%yum brands%','%restaurant brands%','%darden restaurants%',
    '%inspire brands%'
  ];

  new_score int;
begin
  -- Update leads matching any chain pattern in outlet_name or taxpayer_name
  UPDATE public.leads
  SET
    category   = 'corporate_chain',
    score      = GREATEST(0, score - 40),
    priority   = CASE
      WHEN GREATEST(0, score - 40) >= 75 THEN 'good'   -- never 'hot' for chains
      WHEN GREATEST(0, score - 40) >= 50 THEN 'good'
      WHEN GREATEST(0, score - 40) >= 25 THEN 'low'
      ELSE 'skip'
    END,
    score_reasons = array_append(
      COALESCE(score_reasons, '{}'),
      'Corporate chain — payment-processing decisions are made centrally, not by local management'
    )
  WHERE
    category IS DISTINCT FROM 'corporate_chain'
    AND status NOT IN ('won', 'lost', 'do_not_contact')
    AND (
      lower(outlet_name)   LIKE ANY(chain_patterns)
      OR lower(taxpayer_name) LIKE ANY(chain_patterns)
    );

  raise notice 'Migration 010 complete: % chain leads updated', (
    SELECT count(*) FROM public.leads WHERE category = 'corporate_chain'
  );
end$$;
