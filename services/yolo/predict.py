import cv2
import json
import argparse
import os
import uuid
import sys
from datetime import datetime
from ultralytics import YOLO

def run_predict():
    # 1. 配置 CLI 參數
    parser = argparse.ArgumentParser(description="YOLO to Rust Pipeline")
    parser.add_argument("--input", type=str, required=True, help="輸入圖片路徑")
    parser.add_argument("--model", type=str, default="yolo_scripts/models/best20260404_1.pt", help="模型路徑")
    parser.add_argument("--output", type=str, default="yolo_scripts/results", help="輸出根目錄")
    parser.add_argument("--conf", type=float, default=0.5, help="信心度門檻")
    args = parser.parse_args()

    try:
        # 2. 載入模型
        model = YOLO(args.model)
        
        # 3. 讀取圖片
        img = cv2.imread(args.input)
        if img is None:
            error_msg = json.dumps({"status": "error", "message": f"無法讀取圖片: {args.input}"})
            print(error_msg, file=sys.stderr)
            sys.exit(1)

        # 4. 執行預測 (Inference)
        results = model.predict(
            img, 
            imgsz=640, 
            conf=args.conf, 
            iou=0.2, 
            device=os.environ.get("YOLO_DEVICE", "0"),
            augment=True,
            verbose=False  
        )[0]

        # 5. 整理偵測資料
        detections = []
        for box in results.boxes:
            detections.append({
                "class": model.names[int(box.cls[0])],
                "confidence": round(float(box.conf[0]), 3),
                "bbox": [int(x) for x in box.xyxy[0].tolist()] # [x1, y1, x2, y2]
            })

        # 6. 建立儲存目錄
        img_dir = os.path.join(args.output, "images")
        json_dir = os.path.join(args.output, "json")
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(json_dir, exist_ok=True)
        
        # 7. 產生唯一檔名
        file_id = uuid.uuid4().hex[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{timestamp}_{file_id}"
        
        save_img_path = os.path.abspath(os.path.join(img_dir, f"{base_name}.jpg"))
        save_json_path = os.path.abspath(os.path.join(json_dir, f"{base_name}.json"))

        # 8. 儲存視覺化圖片
        cv2.imwrite(save_img_path, results.plot())

        # 9. 準備最終資料格式
        output_data = {
            "status": "success",
            "image_path": save_img_path,
            "json_path": save_json_path,
            "detections": detections
        }

        # 10. 保存 JSON 檔案 (備份用)
        with open(save_json_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=4, ensure_ascii=False)

        # 11.印出純 JSON 給 Rust 接收
        print(json.dumps(output_data, ensure_ascii=False))

    except Exception as e:
        # 捕捉任何執行期異常
        error_res = json.dumps({"status": "error", "message": str(e)})
        print(error_res, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    run_predict()

"""
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣤⣼⣶⡶⠶⠾⠾⠟⠛⠛⠛⠛⠟⠿⠷⠷⢿⣶⣤⣄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢄⣤⣤⡶⠿⠛⠛⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠙⠛⠿⣶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣼⡾⠟⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠿⣶⣤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣴⡿⠛⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⣷⣄⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢠⣾⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢿⣆⠀⠀⠀⠀⠀
⠀⠀⡀⣴⡿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣧⡀⠀⠀⠀
⠀⠀⣼⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠹⣷⠀⠀⠀
⠀⣸⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢴⣤⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⣇⠀⠀
⢠⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢳⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀
⢸⡏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠹⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡀⠀⢸⣧⣀⣴⡧⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀
⣸⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⡀⠈⠙⣿⠏⠃⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀
⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣷⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢷⡄
⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣿
⢻⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣏⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡤⠀⠀⠀⣿⠀⠀⠹⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣿⡅⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⡴⢶⡋⠀⠀⠀⠴⠃⠀⠀⠀⠈⠙⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⣰⡿
⢸⣷⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠌⠻⡁⠀⠀⠀⠀⠐⠶⡶⠖⠛⠋⠉⠀⠀⠀⠈⠳⡄⠀⠀⠀⠀⣸⠁⣠⠔⠛⠉⠓⠦⢤⣄⣠⠀⢀⣾⠟⠁
⠀⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⢤⣀⣀⡀⢀⡞⣁⣤⠤⢴⣶⣶⣶⣦⡤⢤⣽⣆⠀⠀⠀⡿⠚⠁⠀⣀⣀⣀⠀⠀⠺⢳⠀⣾⡏⠀⠀
⠀⢹⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣈⡭⠋⣏⠁⠀⠀⠘⢿⣿⣿⠿⠃⠀⣸⠏⠀⠀⠀⢷⡞⠉⠉⠉⣿⣿⣿⣿⡟⢹⣦⣿⡇⠀⠀
⠀⠀⢿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡄⠀⠀⠀⠶⠋⠀⠀⠀⠘⠣⣄⠀⠀⠀⠀⠀⠀⣠⢴⡍⠀⠀⠀⠀⠀⠙⢦⡀⠀⠈⠛⠛⠋⣠⠋⠀⠹⣿⠀⠀
⠀⠀⠈⢿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⣲⡟⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠓⠒⠚⢋⡡⠋⠀⠀⠀⠀⠀⠀⠀⠀⣷⡤⠤⠤⠒⠋⠁⠀⠀⠀⢿⣇⠀
⠀⠀⠀⠀⠻⣷⡄⠄⠀⠀⠀⠀⠀⠀⠀⢰⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⡤⠞⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡿⠉⠙⠒⠒⠂⠀⠀⠀⠀⠈⣿⡄
⠀⠀⠀⠀⠀⠈⢿⣧⣀⠀⠀⠀⠀⠀⠀⣸⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⡇
⠀⠀⠀⠀⠀⠀⠀⠉⠻⣷⣄⡀⠀⠀⠀⠀⢿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡔⠀⠀⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⡟⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⢷⣦⣤⣤⣌⣿⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡜⠃⠀⠀⠀⠀⠀⠀⠀⠀⠸⡗⢦⡀⠀⠀⠀⢀⣠⣼⠿⠋⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢨⣿⠉⠁⠉⢻⣦⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⢿⠀⢤⣤⡀⠀⠀⠀⠀⠀⠀⢠⡇⡞⠀⠀⡀⣰⣿⠋⠁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⣇⠀⠀⠀⢸⡇⠈⠙⠛⠓⠲⠾⣿⠀⠀⠀⠀⢠⠟⠸⡄⠘⡆⠈⠳⣀⠀⠀⠀⠀⠀⣿⢷⠀⠀⣽⡟⠁⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⡟⠈⠀⠀⠀⣾⠂⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⢀⡟⠀⠀⠀⠀⠀⠀⠀⠈⠷⣄⣠⠴⠞⠁⠈⣇⢀⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣿⠁⠀⠀⠀⢠⣿⠁⠀⠀⠀⠀⠀⠀⣿⡀⠀⢀⡼⠀⠀⠀⠀⠀⠀⠀⢀⣀⣠⠤⢄⣀⠀⠀⠀⢿⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣿⠁⠀⠀⠀⠀⠨⣿⠀⠀⠀⠀⠀⠀⠀⠛⠇⠀⣹⠃⠀⠀⠀⠀⢀⣠⠞⠉⠉⢩⢿⠉⠉⢶⡀⠀⠋⣸⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢠⣿⠃⠃⠀⠀⠀⠀⠈⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠟⠂⠀⠀⠀⣴⠎⠀⢀⣠⣾⠃⠀⣠⣿⣀⣷⠀⠀⢺⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣨⣿⠃⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢿⡉⠉⠉⠀⠈⠓⠋⠉⠀⢉⡿⠀⠀⣏⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢠⣳⡿⠃⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠦⣄⡀⠀⠀⠀⢀⡴⠋⠀⠀⠀⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢸⣿⣥⣄⣀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠓⠒⠚⠉⠀⠀⠀⠀⠀⣟⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠈⠀⠈⠉⠛⠿⣦⣄⣀⠀⠀⠀⣿⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⠮⠤⠖⠋⠀⠀⠀⠀⠀⠥⣿⡆⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⢷⣦⣄⣸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣶⣂⣂⣀⠀⠀⠀⠀⠀⠀⠙⣷⣄⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⢿⣤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠛⢷⣄⠀⠀⠀⠀⠈⢻⣧⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠿⣶⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⡄⠀⠀⠀⠀⠀⢿⡇⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⢷⣤⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⠁⠀⠀⠀⠀⣀⣿⠇⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠛⠷⣶⣦⣄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣿⣴⣶⣶⣶⠾⠛⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⡉⡙⠛⠻⠿⢶⣤⣤⣤⣴⡾⢿⠛⠁⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀
"""