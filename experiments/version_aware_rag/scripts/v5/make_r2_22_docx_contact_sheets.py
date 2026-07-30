from pathlib import Path

from PIL import Image, ImageDraw


BASE = Path("experiments/version_aware_rag/reviewer_packets")
for source_name, output_name in (
    ("qa_en", "contact_en"),
    ("qa_zh", "contact_zh"),
):
    source = BASE / source_name
    output = BASE / output_name
    output.mkdir(parents=True, exist_ok=True)
    files = sorted(
        source.glob("page-*.png"),
        key=lambda item: int(item.stem.split("-")[1]),
    )
    for batch_start in range(0, len(files), 6):
        pages = []
        for file in files[batch_start : batch_start + 6]:
            image = Image.open(file).convert("RGB")
            image.thumbnail((620, 820))
            canvas = Image.new("RGB", (640, 860), "white")
            canvas.paste(image, ((640 - image.width) // 2, 25))
            ImageDraw.Draw(canvas).text((8, 5), file.stem, fill="black")
            pages.append(canvas)
        sheet = Image.new("RGB", (1280, 2580), (210, 210, 210))
        for index, page in enumerate(pages):
            sheet.paste(page, ((index % 2) * 640, (index // 2) * 860))
        sheet.save(
            output / f"contact-{batch_start // 6 + 1:02d}.jpg",
            quality=88,
        )
