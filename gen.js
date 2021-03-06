/* 
  usage
  convert ketaka json into a simpler format with old text to be replaced.
  markup offsets are sorted descendingly for easier merge.

  node gen lst_file kdbfn 
*/
var member_approved=true;  //成員 被 approved
var chief_suggested=false;   //chief 自己加的suggestion

var fs=require("fs");
var kde=require("ksana-database");
var lstfn=process.argv[2]||"ketaka.lst";
var kdb=process.argv[3]||"jiangkangyur201504";
var chieffn="chief.tsv";
var xmlfn2chief={};
var db=null
  ,filenames=null //filenames in KDB
  ,totalmarkup=0
  ,filecontents="" //all text content in kdb
  ,json=[];       //output json

if (lstfn.indexOf(".lst")==-1) lstfn+=".lst";

(function() {
	var lines=fs.readFileSync(chieffn,"utf8").split(/\r?\n/);
	for (var i=0;i<lines.length;i++) {
		var fields=lines[i].split("\t");
		xmlfn2chief[fields[0]]=fields[1];
	}
})();

var fetchText=function(f,seg,s,l){
	var str=filecontents[f][seg];
	return str.substr(s,l);
}


var check=function(chief,payload) {
	var approved=(payload.state==="approve") ;
	var suggestedByChief=(payload.author===chief) && (payload.type=="suggest")

	if (member_approved && chief_suggested) return approved || suggestedByChief;
	if (member_approved) return approved;
	if (chief_suggested) return suggestedByChief;
}

var filterApproved=function(ljfn,rows) {
	var fidx=filenames.indexOf(ljfn);
	if (fidx===-1) {
		throw "file not found in kdb:"+ljfn;
	}
	var chief = xmlfn2chief[ljfn];
	if (!chief.trim()) {
		throw ljfn+" has no chief proreader, check "+chieffn;
	}

	var segnames=db.getFileSegNames(fidx);
	rows.forEach(function(row){
		var pass=check(chief,row.doc.payload);
		if (!pass) return;
		var pageid=parseInt(row.doc.pageid);
		var oldtext=fetchText(fidx,pageid-1,row.doc.start,row.doc.len);
		
		json.push({f:fidx,p:pageid-1, //for sorting only
							file:ljfn,page: segnames[pageid-1], //human readible file name and pb id
							offset:row.doc.start, 
							from:oldtext, to:row.doc.payload.text //replace "from" with "to" at "offset"
							});
	});
	
}
var doconvert=function(file){
	file=file.replace(/\\/,"/");
	var i=file.lastIndexOf("/");
	i=file.lastIndexOf("/",i-1);

	var ljfn=file.substr(i+1).replace("/","/lj").replace("-","_").replace(".json",".xml");
	if (!fs.existsSync(file)) return;
	var rows=require("./"+file).rows;
	totalmarkup+=rows.length;
	filterApproved(ljfn,rows);
}

var sortByFilePageOffset=function(){
	var out=json.sort(function(a,b){
		//assuming offset<65536, total page <4096
		//reverse order offset for easier merge
		return (a.f*4096*65536+a.p*65536+ (65536-a.offset)) -(b.f*4096*65536+b.p*65536+ (65536-b.offset));
	}).map(function(item){
		//remove f and p, not required after sort
		return {file:item.file,page:item.page,offset:item.offset,from:item.from,to:item.to};
	}).filter(function(item,idx){
		var next=json[idx+1];
		if (!next) return true;
		if (item.offset===next.offset) return false;
		return true;
	});
	json=out;
}

kde.open(kdb,function(err,_db){
	db=_db;
	db.get([["filecontents"],["filenames"]],{recursive:true},function(data){
		filecontents=data[0];
		filenames=data[1];
		var lst=fs.readFileSync(lstfn,"utf8").trim().split(/\r?\n/);
		lst.map(doconvert);
		sortByFilePageOffset();
		var outfn=lstfn.replace(".lst","")+".json";
		fs.writeFileSync(outfn,JSON.stringify(json,""," "),"utf8");
		console.log("json files in ",lstfn,"combined to",outfn);
		console.log("total markup",totalmarkup,",approved markup",json.length);
	})
})