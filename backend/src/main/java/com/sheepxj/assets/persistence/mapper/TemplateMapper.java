package com.sheepxj.assets.persistence.mapper;

import com.sheepxj.assets.contract.ApiContracts.CategoryDto;
import com.sheepxj.assets.persistence.model.TemplateRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TemplateMapper {
    TemplateRecord findById(@Param("id") String id);
    List<TemplateRecord> findAll(@Param("category") String category);
    List<CategoryDto> findCategories();
}
