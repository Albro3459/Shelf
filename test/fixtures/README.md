# Catalog fixtures

Captured through fresh anonymous HTTP sessions on October 19, 2026. These are historical responses, not assertions about current shelf availability.

- `search-isbn.xml`: keyword search for `9798892426367`. The first record is digital (`DisplayMaterialType=DIGR`) despite `Ebook=0` and `DocType=Book`. The second is the physical record `1.1906252` (`FICA`). Brief results do not expose both ISBNs directly, though cover metadata contains an ISBN.
- `record.xml`: full record `1.1906252`, requested at Bluebonnet, Jones Creek, South, and Main. All four had `Available=0`. Both hardcover and softcover ISBNs are in the `FullNumber` field. Full title/author labels differ from brief results, and full authors contain Iguana link markup.
- `record-hobbit.xml`: physical record `1.611172` (`NONFICA`), found by a title search for `the hobbit`. The full-record request selected all known EBRPL branch codes and returned one Main Library row with `Available=1`. Other selected branches were absent from this response.
- `search-empty.xml`: a search for `libraryavailabilitynoresultxqz982731` returned zero records with an empty `records` container.

Removed result-set/session identifiers, facets/search context, third-party mashups, NoveList scripts/configuration, and the unrelated synopsis. Retained the XML structure, bibliographic fields, and holdings used by the client. No cookie values or live session identifiers are stored.

The captured search used `StartValue=1`, `NumberToRetrieve=10`, `SearchTechnique=Find`, `ExportByTemplate=Brief`, `TemplateId=Iguana_Brief`, `FacetedSearch=Yes`, `Cluster=1`, `BestMatch=99`, `Sort=Relevancy`, `SortDirection=-1`, `WithoutRestrictions=Yes`, `Associations=Also`, `Index=1*Keywordsbib`, `SearchMode=simple`, and `RequestType=ResultSet_DisplayList`. Other shared fields were `fu=BibSearch`, `Application=Bib`, `Database=1`, `Language=eng`, `Profile=Iguana`, `Namespace=0`, `MetaBorrower=`, `ASRProfile=`, `SummaryHoldings=<selected codes>`, `SessionCMS=`, and the fresh ID in both `CspSessionId` and `SIDTKN`. POSTs retained cookies and set the catalog landing page as Referer.

Tests may modify these fixtures in memory to represent status changes, missing holdings, malformed responses, and duplicate rows. Such cases are synthetic, not additional live observations.
