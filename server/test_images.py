import io
import base64
import json
import time
import unittest
import numpy as np
from PIL import Image
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server.image_api import JOBS, clean_box, inpaint, read_mask, router, statuses

class ImageApiTests(unittest.TestCase):
 def setUp(self):
  JOBS.clear();app=FastAPI();app.include_router(router);self.client=TestClient(app)
 def image(self):
  rgb=np.full((40,60,3),[240,230,220],np.uint8);rgb[10:30,20:40]=[200,30,20];out=io.BytesIO();Image.fromarray(rgb).save(out,format='PNG');return rgb,out.getvalue()
 def test_soft_rle_and_validation(self):
  out=read_mask({'mask':[0,3,128,2,255,1],'maskEncoding':'value-length-rle'},3,2)
  self.assertEqual(out.tolist(),[[0,0,0],[128,128,255]])
  for run in [[255,7],[256,6],[255,-1],[0,5],[0,1.5]]:
   with self.assertRaises(ValueError):read_mask({'mask':run,'maskEncoding':'value-length-rle'},3,2)
 def test_box_is_pixel_xyxy(self):
  self.assertEqual(clean_box([10,5,40,30],60,40).tolist(),[10,5,40,30])
  with self.assertRaises(ValueError):clean_box([10,5,70,30],60,40)
 def test_statuses_distinguish_dependencies_weights_and_gpu(self):
  data=statuses();self.assertIn(data['device'],['cpu','cuda']);models={v['id']:v for v in data['models']};self.assertTrue(models['opencv']['available']);self.assertIn('weights',models['sam3']);self.assertIn('installed',models['sam3'])
 def test_quick_fill_preserves_every_pixel_outside_mask(self):
  rgb,_=self.image();mask=np.zeros(rgb.shape[:2],np.uint8);mask[9:31,19:41]=255;result=inpaint(rgb,mask,'opencv');self.assertTrue(np.array_equal(result[mask==0],rgb[mask==0]));self.assertFalse(np.array_equal(result[mask>0],rgb[mask>0]))
 def test_inpainting_job_returns_real_png(self):
  _,data=self.image();options={'operation':'inpaint','model':'opencv','mask':[0,2400],'maskEncoding':'value-length-rle'}
  response=self.client.post('/images/jobs',files={'image':('image.png',data,'image/png')},data={'options':json.dumps(options)});self.assertEqual(response.status_code,202)
  job=response.json()['id']
  for _ in range(100):
   result=self.client.get('/images/jobs/'+job).json()
   if result['status'] in ['complete','failed']:break
   time.sleep(.01)
  self.assertEqual(result['status'],'complete',result)
  self.assertTrue(result['result']['image'].startswith('data:image/png;base64,'))
 def test_bad_upload_and_bad_mask_are_rejected(self):
  for data,options in [(b'not an image',{'operation':'inpaint'}),(self.image()[1],{'operation':'inpaint','mask':[255,1],'maskEncoding':'value-length-rle'})]:
   response=self.client.post('/images/jobs',files={'image':('x.png',data,'image/png')},data={'options':json.dumps(options)})
   self.assertEqual(response.status_code,422,response.text)
 def test_fill_job_preserves_transparency_outside_selected_region(self):
  rgb,_=self.image();rgba=np.dstack([rgb,np.full(rgb.shape[:2],90,np.uint8)]);buf=io.BytesIO();Image.fromarray(rgba).save(buf,format='PNG')
  mask=np.zeros(rgb.shape[:2],np.uint8);mask[10:20,20:30]=255
  options={'operation':'inpaint','model':'opencv','mask':mask.flatten().tolist()}
  response=self.client.post('/images/jobs',files={'image':('x.png',buf.getvalue(),'image/png')},data={'options':json.dumps(options)});self.assertEqual(response.status_code,202)
  for _ in range(100):
   result=self.client.get('/images/jobs/'+response.json()['id']).json()
   if result['status'] in ['complete','failed']:break
   time.sleep(.01)
  self.assertEqual(result['status'],'complete',result)
  image=np.asarray(Image.open(io.BytesIO(base64.b64decode(result['result']['image'].split(',')[1]))))
  self.assertTrue(np.array_equal(image[mask==0],rgba[mask==0]));self.assertTrue((image[mask>0,3]==255).all())
 def test_unknown_model_and_job_return_errors(self):
  self.assertEqual(self.client.post('/images/models/unknown/download').status_code,404)
  self.assertEqual(self.client.get('/images/jobs/missing').status_code,404)

if __name__=='__main__':unittest.main()
