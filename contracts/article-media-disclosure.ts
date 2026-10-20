export const HISTORICAL_COVER_NOTE = 'Редакционная иллюстрация: она не подтверждает внешний вид конкретного объекта или района.';
export const HISTORICAL_BODY_IMAGES_NOTE = 'Иллюстрации внутри статьи носят пояснительный характер; адреса и внешний вид объектов проверяйте по актуальному каталогу.';

/** Reviewed publication snapshot; neither an upload path nor source=ai establishes per-file provenance. */
export const HISTORICAL_ARTICLE_MEDIA = [
  {
    "id": 16,
    "coverUrl": "/api/uploads/a93bd432-3528-47e3-b14e-07425c0967be.webp",
    "sourceHash": "136796562488b5d5e9d38c1912d0651e6465b9e7a8d56d8bc4ced5c6b8c52841",
    "coverIllustration": true
  },
  {
    "id": 15,
    "coverUrl": "/uploads/13bb2875-bfea-4812-8ecc-48f7eb50679a.webp",
    "sourceHash": "d00faec2f867f774f92ffd3b8c78090de48f491aa9f40dc9614916f2e8ae2a32",
    "coverIllustration": false
  },
  {
    "id": 14,
    "coverUrl": "/uploads/6ed4daf1-e810-434c-bb5e-151e2fb070b4.webp",
    "sourceHash": "cea2cbb074722754720a0ef2e266fef1c9e6214886de0083bf7c832b3ead5495",
    "coverIllustration": false
  },
  {
    "id": 13,
    "coverUrl": "/api/uploads/39cb593d-5532-48ca-9b95-3acdefb528b7.webp",
    "sourceHash": "4e05681fe3e2b3cd5cecc038c6d4ccfbfdf035315e64f3749b31d699738f5abc",
    "coverIllustration": true
  },
  {
    "id": 12,
    "coverUrl": "/api/uploads/a9608a57-05ca-49dc-9a85-af5926714a29.webp",
    "sourceHash": "effd102c8f5a3d5f35868970e137ed69050bdf3b8c222b2e464047356fe38581",
    "coverIllustration": true
  },
  {
    "id": 11,
    "coverUrl": "/api/uploads/3f39dcd1-3467-43f9-a70a-79e72a8cfd55.webp",
    "sourceHash": "ab383dc27b3e8237f1f0ebd6083a1a7fa4f05371fbac698e59b22577cbee6e30",
    "coverIllustration": true
  },
  {
    "id": 10,
    "coverUrl": "/api/uploads/d2d82ffa-e5cc-448d-aff8-e922e84e27d7.webp",
    "sourceHash": "129591a16c9e07672c0117d91d4a1d0915ac5a0b260d089b77eaa8a07a73edff",
    "coverIllustration": true
  },
  {
    "id": 9,
    "coverUrl": "/api/uploads/3a09fb9c-7494-4c50-a4d7-59a469add325.webp",
    "sourceHash": "e669caeb59f664611373b239afdf2ea40ab29edae5fce13c75c068aa3bb05cd9",
    "coverIllustration": true
  },
  {
    "id": 8,
    "coverUrl": "/api/uploads/a62b376a-c3b8-4c2c-ba9d-d1557acfdd39.webp",
    "sourceHash": "041092de833b198b9f0be5d09da740456975874fda7c3729e218862486fba392",
    "coverIllustration": true
  },
  {
    "id": 7,
    "coverUrl": "/api/uploads/c634402c-83e5-4507-824a-8e4134c39444.webp",
    "sourceHash": "447cfde7d54c8bd0292b34da3b78fdd0f84b9419763d5f41d4cbb644f23f9d55",
    "coverIllustration": true
  },
  {
    "id": 6,
    "coverUrl": "/api/uploads/03a814c3-58df-4c77-81ca-9acd1e681395.webp",
    "sourceHash": "bebbe747cff44391a25900343d13d174fce34e3b6a649faba6da16192e7c85fb",
    "coverIllustration": true
  },
  {
    "id": 5,
    "coverUrl": "/api/uploads/b7fd00e9-bc06-4edd-b68a-40c39a399184.webp",
    "sourceHash": "31a83cde50ee71e610106bd2f71443e96d6c4b36b5e279a39d38d9d61377d81a",
    "coverIllustration": true
  },
  {
    "id": 4,
    "coverUrl": "/api/uploads/de749f7b-0ead-4173-b345-6a1fd7773696.webp",
    "sourceHash": "5af3a694c9969c53519d9c55d860af235152b84cad5a9d63ebe821fd550ed3d4",
    "coverIllustration": true
  },
  {
    "id": 1,
    "coverUrl": "/api/uploads/26915453-455c-4621-8651-85903d1682db.webp",
    "sourceHash": "b89e1a94b96252d4a156888cc21ea6bdce8d6d1f0bd6f19139d2024ca6b4d00e",
    "coverIllustration": true
  }
] as const;

/** A factual text correction does not change the provenance of its existing
 * cover. Body-image disclosure is tied to the exact reviewed body revision. */
export function historicalArticleMediaDisclosure(article: { id: number; coverImageUrl?: string | null; sourceHash?: string | null }) {
  const reviewed = HISTORICAL_ARTICLE_MEDIA.find(item => item.id === article.id && item.coverUrl === article.coverImageUrl);
  return reviewed ? { cover: reviewed.coverIllustration, body: reviewed.sourceHash === article.sourceHash } : undefined;
}
