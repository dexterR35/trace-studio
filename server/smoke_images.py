"""Manual integration smoke check with real local checkpoints, never used as a mock."""
from pathlib import Path
import json
import time
import numpy as np
from PIL import Image, ImageDraw
from server.image_api import select, inpaint

def main():
 root=Path(__file__).resolve().parent.parent
 out=root/'test-results'/'smoke-images';out.mkdir(parents=True,exist_ok=True)
 image=Image.new('RGB',(768,512),'white')
 draw=ImageDraw.Draw(image)
 draw.ellipse((75,100,295,360),fill='#287f49')
 draw.rounded_rectangle((440,170,660,370),radius=25,fill='#284b7e')
 rgb=np.asarray(image).copy()
 started=time.monotonic();mask=select(rgb,{'model':'sam2-large','points':[{'x':185,'y':230,'label':1}],'box':[70,95,300,365]})
 assert mask.shape==rgb.shape[:2] and (mask>127).sum()>10000,'SAM 2.1 Large returned an invalid result'
 Image.fromarray(mask).save(out/'sam2-large-mask.png')
 rgba=np.dstack([rgb,mask]);Image.fromarray(rgba).save(out/'sam2-large-cutout.png')
 print(json.dumps({'model':'SAM 2.1 Large','seconds':round(time.monotonic()-started,2),'selected_pixels':int((mask>127).sum())}),flush=True)
 small=np.asarray(image.resize((384,256)));m=np.zeros(small.shape[:2],np.uint8);m[45:185,33:153]=255
 started=time.monotonic();filled=inpaint(small,m,'lama');assert np.array_equal(filled[m==0],small[m==0]);assert not np.array_equal(filled[m>0],small[m>0]);Image.fromarray(filled).save(out/'lama-filled.png')
 print(json.dumps({'model':'LaMa','seconds':round(time.monotonic()-started,2),'outside_mask_preserved':True}),flush=True)

if __name__=='__main__':main()
