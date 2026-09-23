import torch
print(f"PyTorch版本: {torch.__version__}")
print(f"CUDA是否可用: {torch.cuda.is_available()}")
print(f"當前設備: {torch.cuda.current_device() if torch.cuda.is_available() else 'CPU'}")
print(f"設備名稱: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else '無GPU設備'}")