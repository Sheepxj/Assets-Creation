package com.sheepxj.assets.persistence.mapper;

import com.sheepxj.assets.persistence.model.AssetRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AssetMapper {
    int insert(AssetRecord asset);
    AssetRecord findByIdAndUserId(@Param("id") String id, @Param("userId") String userId);
    List<AssetRecord> findByIdsAndUserId(@Param("ids") List<String> ids, @Param("userId") String userId);
}
