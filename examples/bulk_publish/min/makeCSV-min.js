var fs=require("fs"),Papa=require("papaparse"),videoItems=[],author="CrashCourse",year=2017,jsonData={fields:["ID","Type","Title","Description","Artist","Year","Files"],data:[]},finalArrayRow=["","","","","","",""],finalArrayCount=0;fs.readdir(__dirname+"/playlist_videos",function(a,e){for(var i=0;i<e.length;i++){var r=e[i].split(".");if(r.length>0&&3===r.length&&"description"===r[2]){var t=r[0],n=r[1],s=fs.readFileSync(__dirname+"/playlist_videos/"+e[i],{encoding:"utf-8"}),o=s,u={fname:n+".mp4",dname:n,type:"Video",subtype:"Basic"},f={fname:n+".jpg",dname:n+" Thumbnail",type:"Image",subtype:"Thumbnail"},l=JSON.stringify(u)+";"+JSON.stringify(f);jsonData.data.push([t,"Video-Basic",n,o,author,year,l]),finalArrayCount+=1}}for(var i=0;i<finalArrayCount;i++);var p=Papa.unparse(jsonData);fs.writeFile(__dirname+"/output.csv",p,"utf8",function(){console.log("Write output.csv")})});