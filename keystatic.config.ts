import { config, fields, collection } from '@keystatic/core';

export default config({
  storage: {
    kind: 'local',
  },
  collections: {
    news: collection({
      label: 'Aktualności i Wydarzenia',
      slugField: 'title',
      path: 'src/content/news/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Tytuł' } }),
        pubDate: fields.date({
          label: 'Data dodania do Co Tam KATO',
          defaultValue: { kind: 'today' },
        }),
        sourceDate: fields.date({
          label: 'Data publikacji oryginalnego źródła (opcjonalnie)',
        }),
        city: fields.select({
          label: 'Miasto / Rejon',
          options: [
            { label: 'Katowice', value: 'katowice' },
            { label: 'Chorzów', value: 'chorzow' },
            { label: 'Siemianowice Śląskie', value: 'siemianowice' },
            { label: 'Sosnowiec', value: 'sosnowiec' },
            { label: 'Mysłowice', value: 'myslowice' },
            { label: 'Ruda Śląska', value: 'ruda-slaska' },
            { label: 'Tychy', value: 'tychy' },
            { label: 'Czeladź', value: 'czeladz' },
            { label: 'Bytom', value: 'bytom' },
            { label: 'Świętochłowice', value: 'swietochlowice' },
            { label: 'Dąbrowa Górnicza', value: 'dabrowa-gornicza' },
            { label: 'Cała Aglomeracja', value: 'cala-okolica' },
          ],
          defaultValue: 'katowice',
        }),
        category: fields.select({
          label: 'Kategoria',
          options: [
            { label: 'Dla Dzieci (4-10 lat)', value: 'dla-dzieci' },
            { label: 'Wydarzenia & Imprezy', value: 'wydarzenia' },
            { label: 'Drogi & Komunikacja (ZTM/DTŚ)', value: 'drogi-komunikacja' },
            { label: 'Kultura & Rozrywka', value: 'kultura' },
            { label: 'Gastro & Nowe Miejscówki', value: 'gastro' },
            { label: 'Sport & Rekreacja', value: 'sport' },
            { label: 'Ważne Alerty & Ostrzeżenia', value: 'alerty' },
          ],
          defaultValue: 'wydarzenia',
        }),
        isForKids: fields.checkbox({
          label: 'Wydarzenie przyjazne dzieciom (Trafia do sekcji KATO Dzieciaki)',
        }),
        ageRange: fields.text({
          label: 'Przedział wiekowy dzieci (np. 4-10 lat, 5-8 lat)',
        }),
        status: fields.select({
          label: 'Status publikacji',
          options: [
            { label: 'Opublikowany (widoczny na stronie)', value: 'published' },
            { label: 'Szkic / Do moderacji (ukryty)', value: 'draft' },
          ],
          defaultValue: 'published',
        }),
        summary: fields.text({
          label: 'Krótka zajawka (1-2 zdania)',
          multiline: true,
        }),
        location: fields.text({
          label: 'Dokładna lokalizacja (np. Spodek, Park Śląski, Bajka Pana Kleksa)',
        }),
        isAlert: fields.checkbox({
          label: 'Wyróżnij jako pilny alert (pasek u góry strony)',
        }),
        sourceUrl: fields.url({
          label: 'Link do źródła / biletów / oficjalnej strony',
        }),
        aiGenerated: fields.checkbox({
          label: 'Wygenerowane automatycznie przez Agenta AI',
        }),
        content: fields.markdoc({
          label: 'Pełna treść wiadomości',
        }),
      },
    }),
  },
});
